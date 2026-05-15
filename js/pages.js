document.addEventListener("DOMContentLoaded", () => {

    /* =========================
       SCROLL REVEAL ANIMATION
    ========================= */
    const revealElements = document.querySelectorAll(
        '.text-block, .image-side, .text-side, .org-card, .emergency-card, .contact-card'
    );

    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('reveal-visible');
            }
        });
    }, {
        threshold: 0.15
    });

    revealElements.forEach(el => {
        el.classList.add('reveal-hidden');
        revealObserver.observe(el);
    });


    /* =========================
       HERO PARALLAX EFFECT
    ========================= */
    const hero = document.querySelector('.page-hero');

    window.addEventListener('scroll', () => {
        if(hero){
            const offset = window.pageYOffset;
            hero.style.backgroundPositionY = `${offset * 0.45}px`;
        }
    });


    /* =========================
       SMOOTH SCROLL DOWN BUTTON
    ========================= */
    const scrollBtn = document.querySelector('.scroll-down');

    if(scrollBtn){
        scrollBtn.addEventListener('click', () => {
            window.scrollTo({
                top: window.innerHeight - 80,
                behavior: 'smooth'
            });
        });
    }


    /* =========================
       CARD TILT HOVER EFFECT
    ========================= */
    const tiltCards = document.querySelectorAll(
        '.org-card, .emergency-card, .contact-card'
    );

    tiltCards.forEach(card => {
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();

            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            const centerX = rect.width / 2;
            const centerY = rect.height / 2;

            const rotateX = ((y - centerY) / 18);
            const rotateY = ((centerX - x) / 18);

            card.style.transform =
                `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-8px)`;
        });

        card.addEventListener('mouseleave', () => {
            card.style.transform =
                'perspective(1000px) rotateX(0) rotateY(0) translateY(0)';
        });
    });


    /* =========================
       IMAGE LIGHTBOX
    ========================= */
    const orgImages = document.querySelectorAll('.org-card img');

    orgImages.forEach(img => {
        img.style.cursor = 'zoom-in';

        img.addEventListener('click', () => {
            const overlay = document.createElement('div');
            overlay.className = 'img-lightbox';

            overlay.innerHTML = `
                <img src="${img.src}" alt="Preview">
            `;

            document.body.appendChild(overlay);

            overlay.addEventListener('click', () => {
                overlay.remove();
            });
        });
    });


    /* =========================
       ACTIVE NAV LINK
    ========================= */
    const currentPage = window.location.pathname.split('/').pop();

    document.querySelectorAll('.landing-links a').forEach(link => {
        const href = link.getAttribute('href');

        if(href && href.includes(currentPage)){
            link.classList.add('active-nav');
        }
    });

});