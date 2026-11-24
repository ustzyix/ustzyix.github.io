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
    {
      file: "IMG_5898.jpg",
      title: "Amber — 03",
      sub: "Morning · 03",
      tag: "mist · grain",
      exif: {
        camera: "Apple iPhone 7 Plus", captured: "16 ม.ค. 2026 · 09:45",
        aperture: "f/2.8", shutter: "1/100s", focal: "6.60 mm", iso: "ISO 25",
        app: "Adobe Lightroom", resolution: "2938 × 3917 (11.5 MP)"
      }
    },
    {
      file: "IMG_0018.jpg",
      title: "Obsidian — 04",
      sub: "Nocturne · 04",
      tag: "fluted · grain",
      exif: {
        camera: "Apple iPhone 15", captured: "28 มี.ค. 2024 · 20:50",
        aperture: "f/1.6", shutter: "1/17s", focal: "5.96 mm", iso: "ISO 1000",
        app: "Adobe Lightroom", resolution: "2478 × 1395 (3.5 MP)"
      }
    },
    {
      file: "IMG_1328 (2).jpg",
      title: "Gilt — 05",
      sub: "Night · 05",
      tag: "bloom · grain",
      exif: {
        camera: "Apple iPhone 15 Pro Max", captured: "18 ก.ย. 2025 · 21:25",
        aperture: "f/1.8", shutter: "1/25s", focal: "6.76 mm", iso: "ISO 500",
        app: "Adobe Lightroom", resolution: "2746 × 1545 (4.2 MP)"
      }
    }

    // Copy this line for each new photo:
    // { file: "IMG_6001.jpg", title: "Ember", sub: "Dusk · 06", tag: "warm" },
  ]
};
