const fs = require('fs');
const sharp = require('sharp');
const { execSync } = require('child_process');
(async () => {
  const src = 'uploads/1788588207561-kkkkkkkkkkkkkkkkk.webp';
  const out = 'debug.png';
  try {
    await sharp(src).png().toFile(out);
    console.log('Converted to PNG');
    const result = execSync(`tesseract ${out} stdout -l eng`, { encoding: 'utf8' });
    console.log('Tesseract output:\n', result);
  } catch (e) {
    console.error('Error:', e);
  }
})();
