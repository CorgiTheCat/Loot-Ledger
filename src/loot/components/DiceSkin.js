import * as THREE from 'three';
import { DICE_FONTS, DICE_MATERIALS } from '../systems/DiceAppearance.js';

// Procedural maps require no downloads and remain attached to each die face.
export function skinTexture(style) {
  if (style.pattern === 'none') return null;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d');
  // Bake both colors into the map so the pattern is not tinted by the body color.
  ctx.fillStyle = style.bodyColor; ctx.fillRect(0, 0, 512, 512);
  ctx.fillStyle = style.patternColor; ctx.strokeStyle = style.patternColor;
  let seed = 741;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  if (style.pattern === 'marble') {
    for (let i = 0; i < 18; i++) {
      const x = random() * 512, y = random() * 512;
      ctx.beginPath(); ctx.moveTo(x - 180, y - 260);
      ctx.bezierCurveTo(x + 110, y - 70, x - 100, y + 30, x + 170, y + 280);
      ctx.globalAlpha = i % 3 ? .35 : .75;
      ctx.lineWidth = i % 3 ? 3 : 9; ctx.stroke();
    }
  } else if (style.pattern === 'speckled') {
    for (let i = 0; i < 750; i++) {
      ctx.globalAlpha = .3 + random() * .6;
      ctx.beginPath(); ctx.arc(random() * 512, random() * 512, .6 + random() * 3.5, 0, Math.PI * 2); ctx.fill();
    }
  } else if (style.pattern === 'stripes') {
    ctx.globalAlpha = .7; ctx.lineWidth = 16;
    for (let x = -512; x < 1024; x += 56) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 512, 512); ctx.stroke();
    }
  } else if (style.pattern === 'runes') {
    ctx.globalAlpha = .85; ctx.lineWidth = 4;
    for (let y = 20; y < 512; y += 70) for (let x = 20; x < 512; x += 70) {
      ctx.beginPath(); ctx.moveTo(x + 18, y); ctx.lineTo(x + 18, y + 40);
      ctx.moveTo(x + 18, y + 8); ctx.lineTo(x + 34, y + 18); ctx.lineTo(x + 18, y + 28);
      ctx.moveTo(x + 18, y + 20); ctx.lineTo(x + 3, y + 31); ctx.stroke();
    }
  } else if (style.pattern === 'stars') {
    ctx.globalAlpha = .95;
    for (let i = 0; i < 160; i++) {
      const x = random() * 512, y = random() * 512, size = 1 + random() * 4;
      ctx.fillRect(x, y, size, size);
      if (size > 3.5) { ctx.fillRect(x - 3, y + size / 2, size + 6, 1); ctx.fillRect(x + size / 2, y - 3, 1, size + 6); }
    }
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  // A smaller sampled region makes each mark larger without changing the die or numbers.
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  const repeat = 1 / style.patternScale;
  texture.repeat.set(repeat, repeat);
  texture.offset.set((1 - repeat) / 2, (1 - repeat) / 2);
  return texture;
}

export function numberTexture(value, style) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const family = DICE_FONTS.find(font => font.id === style.font).family;
  let size = value > 9 ? 155 : 181;
  ctx.font = `700 ${size}px ${family}`;
  while (ctx.measureText(String(value)).width > 224) { size -= 2; ctx.font = `700 ${size}px ${family}`; }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  const channels = style.numberColor.slice(1).match(/../g).map(channel => parseInt(channel, 16));
  const light = .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
  ctx.lineWidth = 14; ctx.strokeStyle = light > 130 ? '#18121e' : '#fff4dd';
  ctx.strokeText(String(value), 128, 133);
  ctx.fillStyle = style.numberColor; ctx.fillText(String(value), 128, 133);
  if (value === 6 || value === 9) {
    ctx.strokeStyle = style.numberColor; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(109, 222); ctx.lineTo(147, 222); ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function materialValues(style) {
  const finish = DICE_MATERIALS.find(material => material.id === style.material);
  return { color: style.pattern === 'none' ? style.bodyColor : '#ffffff', metalness: style.metalness, roughness: style.roughness,
    clearcoat: finish.clearcoat, clearcoatRoughness: .18, transmission: finish.transmission, thickness: .65 };
}
