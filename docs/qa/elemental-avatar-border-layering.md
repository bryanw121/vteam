# Elemental avatar border layering evidence

![Storm and Aether border layering reference](../ui-mocks/elemental-border-layering-preview.png)

This reference captures the intended result of the `ProfileAvatar` layering fix:

- the profile image stays clipped to its circular photo area;
- Storm and Aether SVG artwork renders behind the opaque photo centre, so decoration cannot cover the photo;
- the outer band scales from 2 to 6 pixels with photo size, instead of using a fixed 12-pixel band;
- border swatches use `ProfileAvatar` with the user's photo, including for locked borders, so their artwork matches the app;
- the SVG uses `pointerEvents="none"`, preserving the photo's edit tap target.

The automated regression test in `__tests__/profileAvatar.layering.test.ts` asserts this render order for both elemental borders. `__tests__/borderPreview.test.tsx` checks photo dimensions at small and profile sizes and shared rendering for all border previews. The image above is a historical code-rendering reference, not a current physical-device screenshot.
