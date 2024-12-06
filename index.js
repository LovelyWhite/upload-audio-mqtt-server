const aedes = require('aedes')()
const server = require('net').createServer(aedes.handle)
const port = 1883
const mqtt = require('mqtt')
const fs = require('fs')
const wav = require('node-wav')
const express = require('express')
const app = express()
const expressPort = 3000
const path = require('path')
const wavPath = path.join(__dirname, 'wav')

function saveFile(outputFilePath, pcmData) {
  console.log(pcmData.length, pcmData)
  // WAV header constants
  const riffChunkId = 'RIFF'
  const waveFormat = 'WAVE'
  const fmtSubchunkId = 'fmt '
  const fmtSubchunkSize = 16 // For PCM
  const audioFormat = 1 // PCM
  const numChannels = 1
  const sampleRate = 16000
  const byteRate = sampleRate * numChannels * 2 // 16 bits per sample
  const blockAlign = numChannels * 2 // 16 bits per sample
  const bitsPerSample = 16
  const dataSubchunkId = 'data'

  // Calculate the size of the RIFF chunk and data subchunk
  let totalSize = 36 + pcmData.length // 36 is the size of the header
  let dataSize = pcmData.length

  // Create the WAV header
  const header = new Buffer.alloc(44) // 44 bytes header for a PCM WAV file
  header.write(riffChunkId, 0, 'ascii')
  header.writeUInt32LE(totalSize - 8, 4) // Exclude the 8 bytes of the RIFF chunk size field itself
  header.write(waveFormat, 8, 'ascii')
  header.write(fmtSubchunkId, 12, 'ascii')
  header.writeUInt32LE(fmtSubchunkSize, 16)
  header.writeUInt16LE(audioFormat, 20)
  header.writeUInt16LE(numChannels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(bitsPerSample, 34)
  header.write(dataSubchunkId, 36, 'ascii')
  header.writeUInt32LE(dataSize, 40)

  // Combine the header with the PCM data
  const wavBuffer = Buffer.concat([header, pcmData])

  // Write the WAV file to disk
  fs.writeFile(outputFilePath, wavBuffer, (err) => {
    if (err) {
      console.error('Error writing WAV file:', err)
    } else {
      console.log(`File saved successfully at: ${outputFilePath}`)
    }
  })
}

aedes.on('client', function (client) {
  console.log(
    'Client Connected: \x1b[33m' + (client ? client.id : client) + '\x1b[0m',
    'to broker',
    aedes.id
  )
})

aedes.on('clientDisconnect', function (client) {
  console.log(
    'Client Disconnected: \x1b[31m' + (client ? client.id : client) + '\x1b[0m',
    'to broker',
    aedes.id
  )
})

server.listen(port, function () {
  console.log('server started and listening on port ', port)
  const client = mqtt.connect('mqtt://127.0.0.1:1883', {
    clientId: 'client',
  })
  client.on('connect', () => {
    client.subscribe('data', (err) => {
      console.log(err)
    })
  })
  let buffer = Buffer.from([])
  client.on('message', function (topic, message) {
    const msg = message.toString()
    if ('start' == msg) {
      buffer = Buffer.from([])
    } else if ('completed' == msg) {
      if (!fs.existsSync(wavPath)) {
        fs.mkdirSync(wavPath)
      }
      saveFile(`${wavPath}/${new Date().getTime()}.wav`, buffer)
    } else {
      buffer = Buffer.concat([buffer, message])
    }
  })
})

// express
app.engine('.html', require('ejs').__express)
app.set('view engine', 'html')
app.set('views', path.join(__dirname, 'views'))
app.use(express.static(wavPath))

app.get('/', function (req, res) {
  if (!fs.existsSync(wavPath)) {
    res.render('index', {
      records: [],
    })
  }
  const files = fs.readdirSync(wavPath)
  res.render('index', {
    records: files,
  })
})

app.listen(expressPort, () => {
  console.log(`Recoding List listening on port ${expressPort}`)
})
