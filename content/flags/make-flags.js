// Dessins originaux de drapeaux (motifs publics), rendus en PNG 600×400.
const fs = require('fs');
const W = 600, H = 400;
const h3 = (a, b, c) => `<rect width="${W}" height="${H/3}" fill="${a}"/><rect y="${H/3}" width="${W}" height="${H/3}" fill="${b}"/><rect y="${2*H/3}" width="${W}" height="${H/3+1}" fill="${c}"/>`;
const v3 = (a, b, c) => `<rect width="${W/3}" height="${H}" fill="${a}"/><rect x="${W/3}" width="${W/3}" height="${H}" fill="${b}"/><rect x="${2*W/3}" width="${W/3+1}" height="${H}" fill="${c}"/>`;
const h2 = (a, b) => `<rect width="${W}" height="${H/2}" fill="${a}"/><rect y="${H/2}" width="${W}" height="${H/2}" fill="${b}"/>`;
// Croix nordique : bras vertical décalé vers le hampe.
const nordic = (bg, cross, unitsW = [5, 2, 9], unitsH = [4, 2, 4]) => {
  const uw = W / unitsW.reduce((a, b) => a + b), uh = H / unitsH.reduce((a, b) => a + b);
  return `<rect width="${W}" height="${H}" fill="${bg}"/><rect x="${unitsW[0]*uw}" width="${unitsW[1]*uw}" height="${H}" fill="${cross}"/><rect y="${unitsH[0]*uh}" width="${W}" height="${unitsH[1]*uh}" fill="${cross}"/>`;
};
const greece = () => {
  let s = ''; const sh = H / 9;
  for (let i = 0; i < 9; i++) s += `<rect y="${i*sh}" width="${W}" height="${sh+0.5}" fill="${i % 2 ? '#FFFFFF' : '#0D5EAF'}"/>`;
  const c = 5 * sh; // canton carré
  s += `<rect width="${c}" height="${c}" fill="#0D5EAF"/><rect x="${2*sh}" width="${sh}" height="${c}" fill="#FFFFFF"/><rect y="${2*sh}" width="${c}" height="${sh}" fill="#FFFFFF"/>`;
  return s;
};
const flags = {
  japon: `<rect width="${W}" height="${H}" fill="#FFFFFF"/><circle cx="${W/2}" cy="${H/2}" r="${H*0.3}" fill="#BC002D"/>`,
  bangladesh: `<rect width="${W}" height="${H}" fill="#006A4E"/><circle cx="${W*0.45}" cy="${H/2}" r="${H*0.3}" fill="#F42A41"/>`,
  suede: nordic('#006AA7', '#FECC00'),
  finlande: nordic('#FFFFFF', '#002F6C', [5, 3, 10], [4, 3, 4]),
  danemark: nordic('#C8102E', '#FFFFFF', [12, 4, 21], [12, 4, 12]),
  suisse: `<rect width="${W}" height="${H}" fill="#1A1630"/><rect x="${(W-H)/2}" width="${H}" height="${H}" fill="#DA291C"/><rect x="${W/2-H*0.1}" y="${H*0.1875}" width="${H*0.2}" height="${H*0.625}" fill="#FFFFFF"/><rect x="${W/2-H*0.3125}" y="${H*0.4}" width="${H*0.625}" height="${H*0.2}" fill="#FFFFFF"/>`,
  ukraine: h2('#0057B7', '#FFD700'),
  pologne: `<rect width="${W}" height="${H}" fill="#FFFFFF"/><rect y="${H/2}" width="${W}" height="${H/2}" fill="#DC143C"/>`,
  allemagne: h3('#000000', '#DD0000', '#FFCE00'),
  autriche: h3('#ED2939', '#FFFFFF', '#ED2939'),
  belgique: v3('#000000', '#FAE042', '#ED2939'),
  irlande: v3('#169B62', '#FFFFFF', '#FF883E'),
  italie: v3('#009246', '#FFFFFF', '#CE2B37'),
  grece: greece(),
};
for (const [name, body] of Object.entries(flags)) {
  fs.writeFileSync(`${name}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${body}</svg>`);
}
console.log(Object.keys(flags).join(' '));
