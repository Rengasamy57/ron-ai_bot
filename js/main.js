/**
 * Ron AI — Main JavaScript
 * Handles smooth interactions, theme toggling, mobile menu, and link states
 */

document.addEventListener('DOMContentLoaded', () => {
    // --- 1. Theme Toggle ---
    const themeToggleBtn = document.getElementById('themeToggle');
    const currentTheme = localStorage.getItem('ron-theme') || 'light';

    if (currentTheme === 'dark') {
        document.body.classList.remove('light-theme');
        document.body.classList.add('dark-theme');
    }

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            const isDark = document.body.classList.contains('dark-theme');
            if (isDark) {
                document.body.classList.remove('dark-theme');
                document.body.classList.add('light-theme');
                localStorage.setItem('ron-theme', 'light');
            } else {
                document.body.classList.remove('light-theme');
                document.body.classList.add('dark-theme');
                localStorage.setItem('ron-theme', 'dark');
            }
        });
    }

    // --- 2. Mobile Menu Toggle ---
    const mobileToggleBtn = document.getElementById('mobileToggle');
    const navMenu = document.getElementById('navMenu');

    if (mobileToggleBtn && navMenu) {
        mobileToggleBtn.addEventListener('click', () => {
            const isOpen = navMenu.classList.contains('open');
            if (isOpen) {
                navMenu.classList.remove('open');
                mobileToggleBtn.setAttribute('aria-expanded', 'false');
            } else {
                navMenu.classList.add('open');
                mobileToggleBtn.setAttribute('aria-expanded', 'true');
            }
        });

        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!navMenu.contains(e.target) && !mobileToggleBtn.contains(e.target)) {
                navMenu.classList.remove('open');
                mobileToggleBtn.setAttribute('aria-expanded', 'false');
            }
        });
    }

    // --- 3. Interactive Floating Cards Hover Effect ---
    const floatingChips = document.querySelectorAll('.floating-chip');
    floatingChips.forEach(chip => {
        chip.addEventListener('mouseenter', () => {
            chip.style.animationPlayState = 'paused';
        });
        chip.addEventListener('mouseleave', () => {
            chip.style.animationPlayState = 'running';
        });
    });

    // --- 4. Navigation Link Active States ---
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            const target = link.getAttribute('href');
            if (target.startsWith('#')) {
                navLinks.forEach(l => {
                    l.classList.remove('active');
                    const indicator = l.querySelector('.active-indicator');
                    if (indicator) indicator.remove();
                });
                link.classList.add('active');
                
                const ind = document.createElement('span');
                ind.className = 'active-indicator';
                link.appendChild(ind);

                if (navMenu.classList.contains('open')) {
                    navMenu.classList.remove('open');
                    mobileToggleBtn.setAttribute('aria-expanded', 'false');
                }
            }
        });
    });

    console.log('Ron AI Landing Page initialized.');
});
