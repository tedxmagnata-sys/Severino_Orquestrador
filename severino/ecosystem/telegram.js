const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

function getToken() {
  return process.env.TELEGRAM_TOKEN || '';
}

function getDefaultChatId() {
  return process.env.TELEGRAM_CHAT_ID || '';
}

function sendMessage(chatId, text, parseMode) {
  return new Promise((resolve, reject) => {
    const token = getToken();
    if (!token || !chatId) return reject(new Error('TELEGRAM_TOKEN ou chatId ausente'));
    const payload = JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: parseMode || 'HTML',
      disable_web_page_preview: false
    });
    const opts = {
      hostname: 'api.telegram.org',
      port: 443,
      path: '/bot' + token + '/sendMessage',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    };
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          parsed.ok ? resolve(parsed) : reject(new Error(parsed.description));
        } catch (e) { reject(new Error(data)); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function sendToDefault(text, parseMode) {
  return sendMessage(getDefaultChatId(), text, parseMode);
}

function setWebhook(url) {
  return new Promise((resolve, reject) => {
    const token = getToken();
    if (!token) return reject(new Error('TELEGRAM_TOKEN ausente'));
    const payload = JSON.stringify({ url: url });
    const opts = {
      hostname: 'api.telegram.org',
      port: 443,
      path: '/bot' + token + '/setWebhook',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    };
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function deleteWebhook() {
  return new Promise((resolve, reject) => {
    const token = getToken();
    const opts = {
      hostname: 'api.telegram.org',
      port: 443,
      path: '/bot' + token + '/deleteWebhook',
      method: 'GET'
    };
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.end();
  });
}

function getWebhookInfo() {
  return new Promise((resolve, reject) => {
    const token = getToken();
    const opts = {
      hostname: 'api.telegram.org',
      port: 443,
      path: '/bot' + token + '/getWebhookInfo',
      method: 'GET'
    };
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.end();
  });
}

function getUpdates(offset) {
  return new Promise((resolve, reject) => {
    const token = getToken();
    let path = '/bot' + token + '/getUpdates?timeout=30';
    if (offset) path += '&offset=' + offset;
    const opts = { hostname: 'api.telegram.org', port: 443, path: path, method: 'GET' };
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.end();
  });
}

module.exports = { sendMessage, sendToDefault, setWebhook, deleteWebhook, getWebhookInfo, getUpdates, getToken, getDefaultChatId };