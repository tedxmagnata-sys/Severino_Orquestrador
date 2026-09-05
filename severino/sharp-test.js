const s = require('sharp');
console.log('SHARP_VERSION', s.versions.sharp);
s({ create: { width: 50, height: 50, channels: 3, background: { r: 30, g: 144, b: 255 } } })
  .png()
  .toFile('/tmp/sharp-test.png')
  .then(() => console.log('SHARP_RENDER_OK'))
  .catch(e => console.log('ERRO', e.message));
