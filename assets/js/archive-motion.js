(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const revealGroups = [
        [".archive-header__inner > *", 0],
        [".archive-category-hero", 0],
        [".archive-category-hero__media", 0],
        [".archive-category-hero__copy > *", 70],
        [".archive-page-heading > *", 70],
        [".archive-about-hero > *", 90],
        [".archive-article__header > *", 70],
        [".archive-section", 0],
        [".archive-section-heading > *", 70],
        [".archive-entry", 55],
        [".archive-year-group", 70],
        [".about-layout > *", 90],
        [".archive-search .search-form", 80],
        [".archive-footer > *", 70],
        [".archive-footer__bottom nav a", 35]
    ];

    revealGroups.forEach(([selector, step]) => {
        document.querySelectorAll(selector).forEach((element, index) => {
            element.dataset.reveal = "";
            element.style.setProperty("--reveal-delay", `${Math.min(index * step, 320)}ms`);
        });
    });

    document.documentElement.classList.add("archive-motion-enabled");

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
        });
    }, {
        rootMargin: "0px 0px -8% 0px",
        threshold: 0.08
    });

    document.querySelectorAll("[data-reveal]").forEach((element) => observer.observe(element));
})();
