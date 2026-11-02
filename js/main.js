document.getElementById("annee").textContent = new Date().getFullYear();

let total = 0;
const compteur = document.getElementById("compteur");
document.getElementById("cta").addEventListener("click", () => {
  total += 1;
  compteur.textContent = `Vous avez dit oui ${total} fois.`;
});
