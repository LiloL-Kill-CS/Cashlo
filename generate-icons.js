const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

// Create icons directory if not exists
const iconsDir = path.join(__dirname, 'public', 'icons');
if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
}

function createIcon(size) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');

    // Background - dark color
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, size, size);

    // Draw rounded corners effect with black background
    ctx.fillStyle = '#0a0a0a';
    ctx.beginPath();
    const radius = size * 0.15;
    ctx.roundRect(0, 0, size, size, radius);
    ctx.fill();

    // Draw letter C
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${size * 0.6}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('C', size / 2, size / 2 + size * 0.05);

    return canvas.toBuffer('image/png');
}

// Create 192x192 icon
const icon192 = createIcon(192);
fs.writeFileSync(path.join(iconsDir, 'icon-192x192.png'), icon192);
console.log('Created icon-192x192.png');

// Create 512x512 icon
const icon512 = createIcon(512);
fs.writeFileSync(path.join(iconsDir, 'icon-512x512.png'), icon512);
console.log('Created icon-512x512.png');

console.log('Icons generated successfully!');
