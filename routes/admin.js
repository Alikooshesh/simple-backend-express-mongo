const express = require('express');
const router = express.Router();
const Record = require('../models/Record');
const User = require('../models/User');
const { requireApiKey, authenticateToken } = require('../middleware/auth');

// Middleware to check if user is admin
const isAdmin = (req, res, next) => {
  if (req.user.is_admin) {
    return next();
  }
  return res.status(403).json({ message: 'Access denied' });
};

// ADMIN - CREATE a new user
router.post('/users', requireApiKey, authenticateToken, isAdmin, async (req, res) => {
  const { email, phone, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and Password are required' });
  }

  try {
    const existingUser = await User.findOne({
      $or: [{ email }, { phone }],
      application_key: req.api_key,
    });

    if (existingUser) {
      return res.status(400).json({ message: 'Email or phone number already in use' });
    }

    const newUser = new User({
      email,
      phone,
      password,
      application_key: req.api_key,
      data_id: Date.now() * (Math.floor(Math.random() * 1000) + 1),
      is_admin: false,
      type: "user",
    });

    await newUser.save();
    res.status(201).json({ message: 'User created successfully', user: newUser });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ADMIN - READ all users
router.get('/users', requireApiKey, authenticateToken, isAdmin, async (req, res) => {
  try {
    const users = await User.find({ application_key: req.api_key });
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ADMIN - UPDATE a user
router.put('/users/:id', requireApiKey, authenticateToken, isAdmin, async (req, res) => {
  const updates = req.body;

  try {
    const user = await User.findOne({ _id: req.params.id, application_key: req.api_key });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    Object.keys(updates).forEach(key => {
      user[key] = updates[key];
    });

    await user.save();
    res.status(200).json({ message: 'User data updated successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ADMIN - DELETE a user
router.delete('/users/:id', requireApiKey, authenticateToken, isAdmin, async (req, res) => {
  try {
    const user = await User.findOneAndDelete({ _id: req.params.id, application_key: req.api_key });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.status(200).json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ADMIN - CHANGE a user's role to admin
router.put('/users/:id/role', requireApiKey, authenticateToken, isAdmin, async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.params.id, application_key: req.api_key });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Change the user's role to admin
    user.is_admin = true;

    await user.save();
    res.status(200).json({ message: 'User role updated to admin successfully', user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});


// EXPORT - Export all records for a user's application
router.get('/data/export', requireApiKey, authenticateToken, isAdmin, async (req, res) => {
  try {
    const records = await Record.find({ application_key: req.api_key });
    const users = await Users.find({ application_key: req.api_key });

    const data = [...records , ...users]

    if (data.length === 0) {
      return res.status(404).json({ message: 'No records found to export' });
    }

    const exportData = data.map(d => {
      const obj = d.toObject();
      delete obj._id;
      delete obj.__v;
      delete obj.application_key;
      obj.id = obj.data_id;
      delete obj.data_id;
      return obj;
    });

    res.json(exportData);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// IMPORT - Import records for a user's application
router.post('/data/import', requireApiKey, authenticateToken, isAdmin, async (req, res) => {
  try {
    if (!Array.isArray(req.body)) {
      return res.status(400).json({ message: 'Invalid import format. Expected an array of records' });
    }

    const importResults = {
      totalProcessed: req.body.length,
      successful: {
        user : 0,
        record : 0
      },
      failed: {
        user : 0,
        record : 0
      },
      errors: []
    };

    for (const data of req.body) {
      try {
        data.data_id = data.id;
        delete data.id;
        if(data.type === 'record'){
          const newRecord = new Record({
            ...data,
            application_key: req.api_key, // Ensure the application key is set
          })
          await newRecord.save();
        }else if(data.type === 'user'){
          const newUser = new User({
            ...data,
            application_key: req.api_key, // Ensure the application key is set
          })
          await newUser.save();
        }
        if(data.type === 'user'){
          importResults.successful.user ++;
        }else if(data.type === 'record'){
          importResults.successful.record ++;
        }
      } catch (error) {
        if(data.type === 'user'){
          importResults.failed.user ++;
        }else if(data.type === 'record'){
          importResults.failed.record ++;
        }
        importResults.errors.push({
          record: data,
          error: error.message
        });
      }
    }

    res.status(201).json({
      message: 'Import completed',
      results: importResults
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});


module.exports = router;