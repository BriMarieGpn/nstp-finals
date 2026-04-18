// Photo / Video toggle
const mediaPlaceholder = document.getElementById('mediaPlaceholder');
const photoBtn = document.getElementById('photoBtn');
const videoBtn = document.getElementById('videoBtn');

const photoSrc = "your-photo.jpg";   // Change to your actual photo
const videoSrc = "your-video.mp4";   // Change to your actual video

// Start with photo by default
mediaPlaceholder.innerHTML = `<img src="${photoSrc}" alt="Plant Photo">`;

photoBtn.addEventListener('click', () => {
    mediaPlaceholder.innerHTML = `<img src="${photoSrc}" alt="Plant Photo">`;
});

videoBtn.addEventListener('click', () => {
    mediaPlaceholder.innerHTML = `
        <video width="100%" height="100%" controls style="border-radius:17px;">
            <source src="${videoSrc}" type="video/mp4">
            Your browser does not support the video tag.
        </video>
    `;
});


window.addEventListener('DOMContentLoaded', () => {
   
    const params = new URLSearchParams(window.location.search);
    const plantName = params.get('name');

    
    if (plantName) {
        document.getElementById('name-header').textContent = plantName;
        document.getElementById('name').textContent = plantName;
    }

    const backBtn = document.querySelector('.btn-left');
    if(backBtn) {
        backBtn.addEventListener('click', () => {
            window.location.href = 'index.html';
        });
    }
});