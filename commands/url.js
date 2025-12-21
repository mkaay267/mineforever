const axios = require("axios");
const FormData = require('form-data');
const fs = require('fs');
const os = require('os');
const path = require("path");

// Helper function to format bytes
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function tourlCommand(sock, chatId, message) {
  try {
    // Check if message is a reply to media
    const quotedMsg = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    
    if (!quotedMsg) {
      await sock.sendMessage(chatId, { 
        text: '❌ Please reply to an image, video, or audio file with .tourl' 
      }, { quoted: message });
      return;
    }

    // Determine media type and download
    let mediaType = null;
    let mimeType = '';
    let mediaBuffer = null;

    if (quotedMsg.imageMessage) {
      mediaType = 'Image';
      mimeType = quotedMsg.imageMessage.mimetype || 'image/jpeg';
      mediaBuffer = await sock.downloadMediaMessage({
        key: {
          remoteJid: chatId,
          id: message.message.extendedTextMessage.contextInfo.stanzaId,
          participant: message.message.extendedTextMessage.contextInfo.participant
        },
        message: quotedMsg
      });
    } else if (quotedMsg.videoMessage) {
      mediaType = 'Video';
      mimeType = quotedMsg.videoMessage.mimetype || 'video/mp4';
      mediaBuffer = await sock.downloadMediaMessage({
        key: {
          remoteJid: chatId,
          id: message.message.extendedTextMessage.contextInfo.stanzaId,
          participant: message.message.extendedTextMessage.contextInfo.participant
        },
        message: quotedMsg
      });
    } else if (quotedMsg.audioMessage) {
      mediaType = 'Audio';
      mimeType = quotedMsg.audioMessage.mimetype || 'audio/mpeg';
      mediaBuffer = await sock.downloadMediaMessage({
        key: {
          remoteJid: chatId,
          id: message.message.extendedTextMessage.contextInfo.stanzaId,
          participant: message.message.extendedTextMessage.contextInfo.participant
        },
        message: quotedMsg
      });
    } else if (quotedMsg.documentMessage) {
      mediaType = 'File';
      mimeType = quotedMsg.documentMessage.mimetype || 'application/octet-stream';
      mediaBuffer = await sock.downloadMediaMessage({
        key: {
          remoteJid: chatId,
          id: message.message.extendedTextMessage.contextInfo.stanzaId,
          participant: message.message.extendedTextMessage.contextInfo.participant
        },
        message: quotedMsg
      });
    } else {
      await sock.sendMessage(chatId, { 
        text: '❌ Please reply to an image, video, audio, or document file' 
      }, { quoted: message });
      return;
    }

    // Send uploading message
    await sock.sendMessage(chatId, { 
      text: '⏳ Uploading to Catbox...' 
    }, { quoted: message });

    // Save to temp file
    const tempFilePath = path.join(os.tmpdir(), `catbox_upload_${Date.now()}`);
    fs.writeFileSync(tempFilePath, mediaBuffer);

    // Get file extension based on mime type
    let extension = '';
    if (mimeType.includes('image/jpeg')) extension = '.jpg';
    else if (mimeType.includes('image/png')) extension = '.png';
    else if (mimeType.includes('image/gif')) extension = '.gif';
    else if (mimeType.includes('video')) extension = '.mp4';
    else if (mimeType.includes('audio')) extension = '.mp3';
    else extension = '.bin';
    
    const fileName = `file${extension}`;

    // Prepare form data for Catbox
    const form = new FormData();
    form.append('fileToUpload', fs.createReadStream(tempFilePath), fileName);
    form.append('reqtype', 'fileupload');

    // Upload to Catbox
    const response = await axios.post("https://catbox.moe/user/api.php", form, {
      headers: form.getHeaders()
    });

    // Clean up temp file
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }

    if (!response.data) {
      throw new Error("Error uploading to Catbox");
    }

    const mediaUrl = response.data.trim();

    // Send response
    await sock.sendMessage(chatId, {
      text: `✅ *${mediaType} Uploaded Successfully*\n\n` +
            `📊 *Size:* ${formatBytes(mediaBuffer.length)}\n` +
            `🔗 *URL:* ${mediaUrl}\n\n` +
            `> © ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴋᴇɪᴛʜ-ᴛᴇᴄʜ`
    }, { quoted: message });

  } catch (error) {
    console.error('Error in tourl command:', error);
    await sock.sendMessage(chatId, { 
      text: `❌ Error: ${error.message || 'Failed to upload file'}` 
    }, { quoted: message });
  }
}

module.exports = tourlCommand;