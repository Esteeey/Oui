// Couvertures originales des thèmes Qu1z (illustrations géométriques), écrites en SVG 1200×700.
// Usage : node make-covers.js <dossier des drapeaux PNG> <dossier de sortie>
const fs = require('fs');
const path = require('path');

const [flagsDir, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const W = 1200;
const H = 700;
const svg = (bg, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${bg}"/>${body}</svg>`;

// Pseudo-aléatoire reproductible.
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

const covers = {};

// Culture générale : pluie de formes et de points d'interrogation.
{
  let b = '';
  const colors = ['#FF8A3D', '#FFC94A', '#FF5C7A', '#2BD9C5', '#B66DFF'];
  for (let i = 0; i < 46; i++) {
    const x = rnd() * W, y = rnd() * H, s = 30 + rnd() * 90, c = colors[i % colors.length], r = rnd() * 360;
    const kind = i % 3;
    if (kind === 0) b += `<circle cx="${x}" cy="${y}" r="${s / 2}" fill="${c}" opacity="0.85"/>`;
    else if (kind === 1) b += `<rect x="${x}" y="${y}" width="${s}" height="${s}" rx="${s / 5}" fill="${c}" opacity="0.8" transform="rotate(${r} ${x} ${y})"/>`;
    else b += `<text x="${x}" y="${y}" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="${s * 1.6}" fill="${c}" opacity="0.9" transform="rotate(${r / 4 - 45} ${x} ${y})">?</text>`;
  }
  covers['cg-melange'] = svg('#2A1640', b);
}

// Capitales : globe quadrillé et repères.
{
  let b = '<g fill="none" stroke="#2BB8D9" stroke-width="5" opacity="0.9">';
  const cx = 820, cy = 360, R = 300;
  b += `<circle cx="${cx}" cy="${cy}" r="${R}"/>`;
  for (let k = 1; k < 6; k++) b += `<ellipse cx="${cx}" cy="${cy}" rx="${(R * k) / 6}" ry="${R}"/>`;
  for (let k = -2; k <= 2; k++) {
    const y = cy + (k * R) / 3;
    const half = Math.sqrt(R * R - (y - cy) ** 2);
    b += `<line x1="${cx - half}" y1="${y}" x2="${cx + half}" y2="${y}"/>`;
  }
  b += '</g>';
  for (const [x, y] of [[700, 250], [900, 420], [780, 480], [980, 280], [640, 390]]) {
    b += `<path d="M${x} ${y} c-22 -30 -22 -60 0 -60 c22 0 22 30 0 60z" fill="#FF6B57"/><circle cx="${x}" cy="${y - 38}" r="9" fill="#0E1A2A"/>`;
  }
  for (let i = 0; i < 60; i++) b += `<circle cx="${rnd() * 520}" cy="${rnd() * H}" r="${1 + rnd() * 3}" fill="#BEE9F5" opacity="0.7"/>`;
  covers['geo-capitales'] = svg('#0E1A2A', b);
}

// Sciences : orbites d'atome et planète à anneau.
{
  let b = '<g fill="none" stroke="#4FD1C5" stroke-width="6">';
  for (const r of [0, 60, 120]) b += `<ellipse cx="380" cy="360" rx="260" ry="90" transform="rotate(${r} 380 360)"/>`;
  b += '</g><circle cx="380" cy="360" r="38" fill="#FFC94A"/>';
  for (const [a, rad] of [[20, 260], [140, 260], [260, 260]]) {
    const t = (a * Math.PI) / 180;
    b += `<circle cx="${380 + rad * Math.cos(t)}" cy="${360 + 90 * Math.sin(t)}" r="16" fill="#FF6B57"/>`;
  }
  b += '<circle cx="900" cy="300" r="130" fill="#7AB8FF"/><ellipse cx="900" cy="300" rx="230" ry="46" fill="none" stroke="#F5F3FF" stroke-width="14" transform="rotate(-18 900 300)"/>';
  for (let i = 0; i < 80; i++) b += `<circle cx="${rnd() * W}" cy="${rnd() * H}" r="${1 + rnd() * 2.5}" fill="#E6FFFB" opacity="0.6"/>`;
  covers['sci-essentiels'] = svg('#0B1E24', b);
}

// Cinéma : pellicule et faisceaux de projecteur.
{
  let b = '';
  b += '<path d="M0 0 L520 700 L760 700 Z" fill="#FFC94A" opacity="0.12"/><path d="M1200 0 L640 700 L880 700 Z" fill="#FFC94A" opacity="0.12"/>';
  b += '<g transform="rotate(-12 600 350)"><rect x="-100" y="270" width="1400" height="200" fill="#121212"/>';
  for (let x = -90; x < 1300; x += 60) {
    b += `<rect x="${x}" y="285" width="34" height="24" rx="5" fill="#FF5C7A"/><rect x="${x}" y="431" width="34" height="24" rx="5" fill="#FF5C7A"/>`;
  }
  for (let x = -60; x < 1300; x += 230) b += `<rect x="${x}" y="325" width="190" height="90" rx="8" fill="#3A1A2A"/>`;
  b += '</g>';
  b += '<g transform="translate(860 80) rotate(-8)"><rect width="230" height="150" rx="14" fill="#F5F3FF"/><rect y="-46" width="230" height="40" fill="#F5F3FF" transform="rotate(-12)"/>';
  for (let i = 0; i < 5; i++) b += `<rect x="${i * 48 + 8}" y="-44" width="24" height="36" fill="#1A0E14" transform="rotate(-12)"/>`;
  b += '</g>';
  covers['cine-grands-films'] = svg('#1A0E14', b);
}

// Jeux olympiques : piste d'athlétisme et médailles (sans les anneaux, symbole protégé).
{
  let b = '';
  const lanes = 6;
  for (let i = 0; i < lanes; i++) {
    const r = 420 - i * 46;
    b += `<path d="M -50 ${700 - i * 46} L 700 ${700 - i * 46} A ${r} ${r} 0 0 0 700 ${700 - i * 46 - 2 * r}" fill="none" stroke="${i % 2 ? '#F5F3FF' : '#FF8A5B'}" stroke-width="${i % 2 ? 5 : 40}" opacity="${i % 2 ? 0.8 : 0.9}"/>`;
  }
  for (const [x, y, c] of [[930, 200, '#FFC94A'], [1050, 330, '#C9D1DE'], [880, 420, '#D08A4A']]) {
    b += `<path d="M${x - 30} ${y - 120} L${x} ${y - 40} L${x + 30} ${y - 120}" fill="none" stroke="#2FCB7A" stroke-width="18"/><circle cx="${x}" cy="${y}" r="62" fill="${c}"/><circle cx="${x}" cy="${y}" r="40" fill="none" stroke="#FFFFFF" stroke-width="5" opacity="0.6"/>`;
  }
  covers['sports-jo'] = svg('#B5432A', b);
}

for (const [name, content] of Object.entries(covers)) fs.writeFileSync(path.join(out, `${name}.svg`), content);

// Drapeaux du monde : mosaïque inclinée des drapeaux dessinés pour Qu1z.
{
  const flags = fs.readdirSync(flagsDir).filter((f) => f.endsWith('.png')).sort();
  let b = '<g transform="rotate(-10 600 350) translate(-160 -180)">';
  let i = 0;
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 7; col++) {
      const f = flags[(i++ * 5) % flags.length];
      const data = fs.readFileSync(path.join(flagsDir, f)).toString('base64');
      b += `<image href="data:image/png;base64,${data}" x="${col * 230 + (row % 2) * 115}" y="${row * 170}" width="210" height="140"/>`;
    }
  }
  b += '</g>';
  fs.writeFileSync(path.join(out, 'geo-drapeaux.svg'), svg('#10131C', b));
}
console.log(fs.readdirSync(out).join(' '));
