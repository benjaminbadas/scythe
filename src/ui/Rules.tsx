/** Résumé des règles affiché depuis l'accueil. */
export function Rules() {
  return (
    <section className="panel rules">
      <h2>Résumé des règles</h2>
      <p>
        <b>But</b> : avoir le plus d’argent à la fin. La partie s’arrête dès qu’un joueur place sa <b>6e étoile</b>. On compte alors ses pièces, plus des pièces
        par étoile, par territoire contrôlé (l’Usine en vaut 3) et par 2 ressources contrôlées, selon sa <b>popularité</b> (0–6, 7–12, 13–18), et le bonus de
        structures tiré au début.
      </p>
      <p>
        <b>Étoiles</b> : 6 améliorations, 4 méchas, 4 structures, 4 recrues, 8 ouvriers sur le plateau, un objectif, une victoire au combat (2 au plus), 18 de
        popularité, 16 de puissance.
      </p>
      <h3>Le tour</h3>
      <ol>
        <li>Choisir une section de sa fiche, différente de celle du tour précédent (sauf Rusviet).</li>
        <li>Faire l’action du haut (facultatif) : Déplacer (ou gagner des pièces), Échanger, Produire, Renforcer.</li>
        <li>Faire l’action du bas (facultatif) : Améliorer (pétrole), Déployer (métal), Construire (bois), Enrôler (nourriture). Elle rapporte aussi des pièces.</li>
      </ol>
      <h3>Unités et déplacements</h3>
      <ul>
        <li>Personnage, méchas et ouvriers avancent d’une case, ni à travers les rivières ni sur les lacs. Les tunnels sont adjacents entre eux.</li>
        <li>Les méchas transportent les ouvriers. Les capacités des méchas (Berge, Rapidité…) valent pour le personnage et tous les méchas.</li>
        <li>Entrer sur une case d’ouvriers adverses les renvoie chez eux (−1 popularité par ouvrier). Entrer sur un personnage ou mécha adverse déclenche un combat.</li>
        <li>Le personnage qui s’arrête sur un jeton ✦ fait une rencontre ; sur l’Usine, il prend une carte Usine (une 5e section).</li>
      </ul>
      <h3>Combat</h3>
      <p>
        Chacun choisit en secret une puissance (7 au plus) et une carte Combat par personnage ou mécha engagé. Le plus fort gagne (l’attaquant gagne les
        égalités) et place une étoile ; le perdant se retire à sa base et pioche une carte s’il a engagé quelque chose. Les deux paient la puissance engagée.
      </p>
    </section>
  );
}
