# LHW Archive World

## World sentence

Scroll through one persistent personal archive, where three illuminated orbital records separate life notes, technical reports, and project progress from a shared memory core.

## Interaction contract

Native page scroll conducts camera position and scene state. Pointer movement adds a small, reversible parallax. All navigation and category access remain ordinary links and buttons in the DOM.

## Visual grammar

| role | value | use |
| --- | --- | --- |
| void | `#050713` | page and scene background |
| deep indigo | `#0b1535` | atmospheric depth |
| archive white | `#f4f6ff` | body copy and focal labels |
| ion blue | `#6f9cff` | life notes and primary focus |
| plasma violet | `#b17cff` | technical notes |
| signal cyan | `#67f5d4` | project notes and success states |

The world uses one metallic core, a translucent wire shell, three orbital rings, and seeded particle dust. The core is the LHW archive; the rings are content families, not decorative background noise.

## Chapters

| chapter | beat | camera | world change |
| --- | --- | --- | --- |
| 0 | Ideas enter the archive | close frontal view | core bright, rings quiet |
| 1 | Three paths become visible | orbit right and down | rings spread and nodes brighten |
| 2 | The archive becomes readable | pull back above | core recedes behind latest entries |

## Responsive and accessibility

- Desktop DPR is capped at 1.75 and mobile at 1.4.
- Geometry and all copy remain available when WebGL fails.
- Reduced-motion mode stops ambient rotation and snaps the camera to chapter endpoints.
- The canvas is decorative; all category and article links live in semantic HTML.
- Mobile uses a shallower camera route and a larger pullback.

## Performance budget

- No external models or textures.
- Initial 3D payload is the local Three.js module.
- Desktop target: 60 fps, under 50 draw calls, under 100k visible triangles.
- Mobile target: 40 fps fallback, DPR 1.4, particles reduced by half.
