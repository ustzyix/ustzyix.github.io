/* ==========================================================
   ustzyix — photo list
   This is the ONLY file you edit when you add photos.

   1) Upload the image into the  images/  folder
   2) Add one block to "photos" below (only "file" is required)
   ========================================================== */
window.GALLERY = {
  folder: "images",   // folder that holds the photos
  discover: true,     // true = photos in the folder that are NOT listed below still appear (title comes from the file name)
  // repo: "ustzyix/ustzyix.github.io",   // only needed if auto-detect fails (custom domain)

  photos: [
    {
      file: "IMG_5755 (2).jpg",        // exact file name, spaces and extension included
      title: "Crimson — 01",           // optional
      sub: "Nocturne · 01",            // optional
      tag: "fluted · grain",           // optional, leave out to hide the chip
      exif: {                          // optional, leave out to read it from the file
        camera: "Apple iPhone 7 Plus", captured: "12 ต.ค. 2025 · 12:16",
        aperture: "f/1.8", shutter: "1/1500s", focal: "3.99 mm", iso: "ISO 20",
        app: "Adobe Lightroom", resolution: "2612 × 1470 (3.8 MP)"
      }
    },
    {
      file: "IMG_5738 (1).jpg",
      title: "Magenta — 02",
      sub: "Stillness · 02",
      tag: "bloom · grain",
      exif: {
        camera: "Apple iPhone 7 Plus", captured: "12 ต.ค. 2025 · 11:59",
        aperture: "f/1.8", shutter: "1/100s", focal: "3.99 mm", iso: "ISO 32",
        app: "Adobe Lightroom", resolution: "3024 × 1701 (5.1 MP)"
      }
    },

    // Copy this line for each new photo:
    // { file: "IMG_6001.jpg", title: "Ember", sub: "Dusk · 03", tag: "warm" },
  ]
};
