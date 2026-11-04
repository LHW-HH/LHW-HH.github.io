# Planet Jumping Home Cover

## World sentence

Enter a Mars research vista, look through three tilting category portals, and
choose life notes, project progress, or technical reports.

## Structure

- The cover occupies one full viewport and uses native page scroll only to reach
  the existing life, technology, projects, and latest-post sections.
- One 2D canvas paints the rounded portal mask and its pointer-driven fake 3D
  tilt. The portal media stays screen-locked behind the moving mask.
- The three category portals remain side by side and each opens its own content
  route with an expanding shared-element transition.

## Assets

All media uses the exact CloudFront URLs supplied in the approved brief:

- Mars background and introduction video
- Earth and Venus transition videos
- Mercury still image
- Floating LHW wordmark

The page uses local font fallbacks and no JavaScript framework.

## Accessibility and fallback

- All navigation and the portal are real links or buttons.
- The cover remains understandable when JavaScript is unavailable through a
  direct archive link.
- Reduced-motion mode pauses video, removes tilt and entrance motion, and shows
  the complete cover immediately.
- The portal is keyboard-focusable and the custom cursor is disabled for coarse
  pointers.

## Verified viewports

- 1440 x 900
- 768 x 1024
- 390 x 844
- 375 x 812

All tested viewports have no horizontal overflow and report no JavaScript
errors during portal hover and launch interactions.
