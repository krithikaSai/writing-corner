CHARACTER PORTRAITS
===================
female/ and male/ each contain:
  base.webp            the bald base figure
  eyes.webp            mask that marks the eyes (used for eye colour)
  <hairstyle>/1.webp, 2.webp, ...   full figure with that hairstyle, one file per outfit
  <hairstyle>/hair.webp             mask that marks the hair (used for hair colour)
manifest.json lists which hairstyles exist and how many outfits each has.
The hairstyle dropdown and outfit arrows are built from it.

To add more hairstyles or outfits, send the original images to Claude, who
prepares them (transparent background + masks) and updates manifest.json.
