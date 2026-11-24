window.setProjectData("videos-01", {
  folder: "videos",
  discover: true, // หากใช้วิธีที่ 2 (push ลงโฟลเดอร์ videos/) ระบบจะดึงไฟล์เพิ่มให้อัตโนมัติ

  photos: [
    {
      // กรณีใช้วิธีที่ 1 (GitHub Releases) ให้เปิดใช้บรรทัด src ด้านล่างและวางลิงก์ที่คัดลอกมา:
      // src: "https://github.com/ustzyix/ustzyix.github.io/releases/download/videos/008.END_1.mp4",

      // กรณีใช้วิธีที่ 2 (อัปโหลดลงโฟลเดอร์ videos/) ใช้แค่ชื่อไฟล์ได้เลย:
      file: "008.END_1.mp4",
      title: "008.END_1",
      sub: "Edit · 28 ก.ค. 2023",
      tag: "1080×1080 · 39MB",
      aura: "#b91c1c" // กำหนดสีบรรยากาศหลักให้คลิป (หรือเปลี่ยนรหัสสี Hex ตามต้องการ)
    }
  ]
});
