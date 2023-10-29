
const sqlite3 = require('sqlite3');
const { Sequelize, DataTypes } = require('sequelize')
const express = require('express')
const bodyParser = require('body-parser')
const execa = require('execa')
const { v4: uuidv4 } = require('uuid')
const youtubedl = require('youtube-dl-exec')
const fs = require('fs')
const cors = require('cors')
require('dotenv').config()

const config = require('./config/config.json').development

const AWS = require('aws-sdk')

// AWS configuration
AWS.config.update({
  region: 'ap-southeast-2',
  accessKeyId: process.env.AWSKEY,
  secretAccessKey: process.env.AWSSECRET
})

const s3 = new AWS.S3()

const app = express()
app.use(
  cors({
    origin: 'chrome-extension://jfgbfdooafbmhkoljedndncacpggckdp'
  })
)
app.use(bodyParser.json())

const sequelize = new Sequelize(
  config.database,
  config.username,
  config.password,
  config
)

// Define models
const Sound = sequelize.define('Sound', {
  title: {
    type: DataTypes.STRING,
    allowNull: false
  },
  url: {
    type: DataTypes.STRING,
    allowNull: false
  },
  imageURL: {
    type: DataTypes.STRING,
    allowNull: true
  }
})
const Music = sequelize.define('Music', {
  title: {
    type: DataTypes.STRING,
    allowNull: false
  },
  url: {
    type: DataTypes.STRING,
    allowNull: false
  },
  imageURL: {
    type: DataTypes.STRING,
    allowNull: true
  }
})

//double check models match db

sequelize
  .sync({ alter: false }) // Note: Using 'alter' can be destructive and may drop tables
  .then(() => {
    console.log('db done')
    app.listen(PORT,'0.0.0.0', () => {
      console.log(`Server is running on port ${PORT}`)
    })
  })
  .catch(error => {
    console.error('Unable to connect to the database:', error)
  })

//middlewear to handle errors when hitting db

// Endpoints
app.get('/sound', async (req, res) => {
  try {
    const sounds = await Sound.findAll()
    res.json(sounds)
  } catch (err) {
    next(err)
  }
})

app.get('/music', async (req, res) => {
  try {
    const music = await Music.findAll()
    res.json(music)
  } catch (err) {
    next(err)
  }
})

app.post('/upload', express.json(), async (req, res, next) => {
  console.log('got a request')
  const { url, type, title, start, end } = req.body
  console.log(req.body)

  let ffmpegArgs = []

  if (start) {
    ffmpegArgs.push(`-ss ${start}`)
  }
  if (end) {
    ffmpegArgs.push(`-to ${end}`)
  }

  if (!url || (req.body.type !== 'sound' && req.body.type !== 'music')) {
    return res.status(400).json({ error: 'Invalid input' })
  }
  if (start && !/^(\d{1,2}:)?\d{1,2}:\d{1,2}$/.test(start)) {
    return res
      .status(400)
      .json({ error: 'Invalid start time format. Use HH:MM:SS or MM:SS.' })
  }

  if (end && !/^(\d{1,2}:)?\d{1,2}:\d{1,2}$/.test(end)) {
    return res
      .status(400)
      .json({ error: 'Invalid end time format. Use HH:MM:SS or MM:SS.' })
  }

  // Download audio from YouTube
  try {
    const outputName = title + '.mp3' // Unique filename
    const output = await youtubedl(url, {
      extractAudio: true,
      audioFormat: 'mp3',
      o: outputName,
      postprocessorArgs: ffmpegArgs
    })

    console.log('got an output')
    // Upload to S3
    const s3Params = {
      Bucket: 'dnd-soundboard',
      Key: `${type}/${outputName}`,
      Body: fs.createReadStream(outputName),
      // ACL: 'public-read', // So that it can be accessed publicly
      ContentType: 'audio/mpeg'
    }

    await s3.upload(s3Params, (err, data) => {
      if (err) {
        return next(err)
      }

      console.log('uploaded')
      // Delete the local file
      fs.unlink(outputName, err => {
        if (err) console.error(`Failed to delete local file: ${err}`)
      })

      const s3URL = data.Location

      // Save to database
      if (type === 'sound') {
        Sound.create({ title: outputName, url: s3URL })
      } else {
        Music.create({ title: outputName, url: s3URL })
      }

      res.json({ message: 'Uploaded successfully', url: s3URL })
    })
  } catch (error) {
    next(error)
  }
})

app.use((err, req, res, next) => {
  if (err instanceof Sequelize.ValidationError) {
    return res.status(400).json({ error: err.message })
  }
  if (err instanceof Sequelize.DatabaseError) {
    return res.status(500).json({ error: 'Database error occurred' })
  }
  next(err)
})

// Start the server
const PORT = 3001

process.on('SIGINT', () => {
  console.log('Shutting down server...')
  sequelize.close()
  process.exit(0)
})
