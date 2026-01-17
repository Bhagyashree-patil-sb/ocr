let videoStream = null;

async function init() {
  const loadingOverlay = document.getElementById("loadingOverlay");
  loadingOverlay.style.display = "flex";
  loadingOverlay.querySelector(".loader").textContent = "Loading Models...";

  if (!faceapi) {
    alert("Face-api.js not loaded!");
    return;
  }

  const initialMembers = [
    {
      name: "Bhagyashree Patil",
      usn: "SG23CSD007",
      images: [
        "face-data/Bhagyashree1.jpeg",
        "face-data/Bhagyashree2.jpeg",
        "face-data/Bhagyashree3.jpeg",
        "face-data/Bhagyashree4.jpeg",
        "face-data/Bhagyashree5.jpeg",
        "face-data/Bhagyashree6.jpeg",
        "face-data/Bhagyashree7.jpeg",
        "face-data/Bhagyashree8.jpeg"
      ]
    },
    {
      name: "Chetana Patil",
      usn: "SG23CSD011",
      images: [
        "face-data/Chetena1.jpeg",
        "face-data/Chetena2.jpeg",
        "face-data/Chetena3.jpeg",
        "face-data/Chetena4.jpeg",
        "face-data/Chetena5.jpeg",
        "face-data/Chetena6.jpeg",
        "face-data/Chetena7.jpeg",
        "face-data/Chetena8.jpeg",
        "face-data/Chetena9.jpeg"
      ]
    },
    {
      name: "Supriya Hiremath",
      usn: "SG23CSD049",
      images: [
        "face-data/Supriya1.jpeg",
        "face-data/Supriya2.jpeg",
        "face-data/Supriya3.jpeg",
        "face-data/Supriya4.jpeg",
        "face-data/Supriya5.jpeg",
        "face-data/Supriya6.jpeg",
        "face-data/Supriya7.jpeg",
        "face-data/Supriya8.jpeg",
        "face-data/Supriya9.jpeg",
        "face-data/Supriya10.jpeg",
        "face-data/Supriya11.jpeg",
        "face-data/Supriya12.jpeg"
      ]
    },
    {
      name: "Mahantesh",
      usn: "SG23CSD019",
      images: [
        "face-data/suresh1.jpeg"
      ]
    }
  ];

  const savedMembers = JSON.parse(localStorage.getItem("members") || "[]");
  const members = [...initialMembers, ...savedMembers];

  const MODEL_URL = './models';
  await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
  await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
  await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);

  loadingOverlay.querySelector(".loader").textContent = "Starting Camera...";
  const video = document.getElementById("video");

  async function startCamera() {
    if (!videoStream) {
      try {
        videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
        video.srcObject = videoStream;
        await video.play();
      } catch (err) {
        alert("Camera error: " + err);
      }
    }
  }

  function stopCamera() {
    if (videoStream) {
      videoStream.getTracks().forEach(track => track.stop());
      video.srcObject = null;
      videoStream = null;
    }
  }

  await startCamera();

  loadingOverlay.querySelector(".loader").textContent = "Preparing Face Data...";

  const labeledDescriptors = [];

  for (let person of members) {
    const descriptors = [];
    for (let imgPath of person.images) {
      try {
        const img = await faceapi.fetchImage(imgPath);
        const detection = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor();
        if (detection) descriptors.push(detection.descriptor);
        else console.warn(`Face not detected in ${imgPath}`);
      } catch (err) {
        console.warn(`Failed to load ${imgPath}: ${err}`);
      }
    }
    if (descriptors.length > 0) {
      labeledDescriptors.push(new faceapi.LabeledFaceDescriptors(person.name, descriptors));
    } else {
      console.warn(`No descriptors found for ${person.name}`);
    }
  }

  const faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.6);
  const attendanceTable = document.getElementById("attendance");
  const lastMarked = {};
  const recognitionCounts = {};

  loadingOverlay.style.display = "none";

  function loadAttendance() {
    attendanceTable.innerHTML = "";
    const data = JSON.parse(localStorage.getItem("attendance") || "[]");
    data.sort((a,b) => new Date(a.time) - new Date(b.time));
    data.forEach(d => {
      const member = members.find(m => m.name === d.name);
      const usn = member ? member.usn : "";
      attendanceTable.innerHTML += `<tr><td>${d.name}</td><td>${usn}</td><td>${d.date}</td><td>${d.time}</td></tr>`;
    });
  }

  function markAttendance(name) {
    recognitionCounts[name] = (recognitionCounts[name] || 0) + 1;
    if (recognitionCounts[name] < 3) return;
    const now = Date.now();
    if (lastMarked[name] && now - lastMarked[name] < 10000) return;
    lastMarked[name] = now;
    const today = new Date().toISOString().split('T')[0];
    const data = JSON.parse(localStorage.getItem("attendance") || "[]");
    if (data.some(d => d.name === name && d.date === today)) return;
    const time = new Date().toTimeString().split(' ')[0];
    data.push({ name, date: today, time });
    localStorage.setItem("attendance", JSON.stringify(data));
    loadAttendance();

    const canvasSnap = document.createElement("canvas");
    canvasSnap.width = video.videoWidth;
    canvasSnap.height = video.videoHeight;
    canvasSnap.getContext("2d").drawImage(video, 0, 0, canvasSnap.width, canvasSnap.height);
    const faceData = JSON.parse(localStorage.getItem("faceAudit") || "[]");
    faceData.push({ name, date: today, time, img: canvasSnap.toDataURL("image/jpeg") });
    localStorage.setItem("faceAudit", JSON.stringify(faceData));
    recognitionCounts[name] = 0;
  }

  loadAttendance();

  const canvas = faceapi.createCanvasFromMedia(video);
  canvas.style.position = "absolute";
  canvas.style.top = "0";
  canvas.style.left = "0";
  canvas.style.zIndex = "10";
  document.querySelector('.video-container').appendChild(canvas);
  const displaySize = { width: video.videoWidth, height: video.videoHeight };
  faceapi.matchDimensions(canvas, displaySize);
  const ctx = canvas.getContext("2d");

  async function detectLoop() {
    if (!videoStream) return requestAnimationFrame(detectLoop);
    const detections = await faceapi.detectAllFaces(video).withFaceLandmarks().withFaceDescriptors();
    const resized = faceapi.resizeResults(detections, displaySize);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    resized.forEach(d => {
      const match = faceMatcher.findBestMatch(d.descriptor);
      const isKnown = match.label !== "unknown";
      const boxColor = isKnown ? "green" : "red";
      if (isKnown) markAttendance(match.label);

      const drawBox = new faceapi.draw.DrawBox(d.detection.box, {
        label: match.label,
        boxColor: boxColor,
        lineWidth: 4
      });
      drawBox.options.labelBackgroundColor = boxColor;
      drawBox.options.labelColor = "white";
      drawBox.draw(canvas);
    });

    requestAnimationFrame(detectLoop);
  }

  detectLoop();

  document.getElementById("export").onclick = () => {
    const data = JSON.parse(localStorage.getItem("attendance") || "[]");
    const csv = [["Name","USN","Date","Time"], ...data.map(d => {
      const member = members.find(m => m.name === d.name);
      const usn = member ? member.usn : "";
      return [d.name, usn, d.date, d.time];
    })].map(e => e.join(",")).join("\n");
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  document.getElementById("reset").onclick = () => {
    if (confirm("Are you sure you want to reset attendance?")) {
      localStorage.removeItem("attendance");
      localStorage.removeItem("faceAudit");
      loadAttendance();
    }
  };

  const toggleBtn = document.getElementById("toggleCam");
  toggleBtn.onclick = async () => {
    if (videoStream) {
      stopCamera();
      toggleBtn.textContent = "Turn Camera On";
    } else {
      await startCamera();
      toggleBtn.textContent = "Turn Camera Off";
    }
  };

  document.getElementById("addMember").onclick = async () => {
    const name = document.getElementById("newName").value.trim();
    const usn = document.getElementById("newUSN").value.trim();
    const files = document.getElementById("newImages").files;
    if (!name || !usn || files.length === 0) { alert("Please provide name, USN, and at least one image."); return; }
    const descriptors = [];
    for (let file of files) {
      const img = await faceapi.bufferToImage(file);
      const detection = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor();
      if (detection) descriptors.push(detection.descriptor);
    }
    if (descriptors.length === 0) { alert("No faces detected in the provided images."); return; }

    const newMember = new faceapi.LabeledFaceDescriptors(name, descriptors);
    faceMatcher.labeledDescriptors.push(newMember);
    members.push({ name, usn, images: [] });

    savedMembers.push({ name, usn, images: [] });
    localStorage.setItem("members", JSON.stringify(savedMembers));

    alert(`Member "${name}" added successfully!`);
    document.getElementById("newName").value = "";
    document.getElementById("newUSN").value = "";
    document.getElementById("newImages").value = "";
  };
}

window.onload = init;
