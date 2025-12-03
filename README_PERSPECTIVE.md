# Space-to-Space: 3D Perspektiva

Stručný popis technického řešení perspektivy pro AI modely.

## 1. Princip "Krabice"
- **CSS 3D Transforms**: Scéna je "místnost" (`.room`) definovaná CSS proměnnými (`--room-width`, `--room-height`, `--room-depth`).
- **Stěny**: 
  - `floor` (podlaha): `rotateX(90deg)`
  - `ceiling` (strop): `rotateX(-90deg)`
  - `back-wall` (zadní): `translateZ(-depth/2)`
- **Wireframe**: Mřížka je nahrazena SVG overlayem (`.wireframe-overlay`), který JS vykresluje spojením rohů obrazovky (2D) a rohů zadní stěny (3D markery). Tím zajišťuje konstantní tloušťku čar (1px).

## 2. Obsah a Scroll
- **3 Zóny**: Obsah není jeden dlouhý pás, ale je rozdělen do 3 nezávislých zón:
  - `.floor-content`: Obsah na podlaze.
  - `.back-content`: Obsah na zadní stěně.
  - `.ceiling-content`: Obsah na stropě.
- **Pohyb (JS)**:
  - Scroll (`wheel`) posouvá obsah v každé zóně nezávisle.
  - Směr pohybu vytváří efekt "průletu tunelem" (vše jede proti směru pohledu).
  - Změna hloubky (`depthSlider`) vizuálně protáhne místnost, ale **neposune** obsah z jedné zóny do druhé (vzniká mezera/přeryv, což je záměr).
- **Layout**:
  - Zóny používají Flexbox (`column-reverse`, `justify-content: flex-end`) pro správné řazení a "přilepení" obsahu k zadní stěně.

## 3. Klíčové Proměnné
- `--room-depth`: Ovládá hloubku místnosti (Z-axis).
- `state.scrollPos`: Globální pozice scrollu, aplikovaná na `translateY` kontejnerů zón.

