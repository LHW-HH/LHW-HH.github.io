const experience = document.querySelector(".planet-cover");

if (experience) {
    startPlanetCover();
}

function startPlanetCover() {
    const preloader = experience.querySelector("#preloader");
    const preloaderVideo = experience.querySelector("#preloader-video");
    const preloaderCount = experience.querySelector("#preloader-count");
    const preloaderValue = experience.querySelector("#preloader-value");
    const preloaderSkip = experience.querySelector("#preloader-skip");
    const floatingLogo = experience.querySelector("#floating-logo");
    const backgroundVideo = experience.querySelector(".background");
    const cursor = experience.querySelector(".custom-cursor");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const coarsePointer = window.matchMedia("(pointer: coarse)");
    const portals = [...experience.querySelectorAll(".category-portal")].map((element) => ({
        element,
        canvas: element.querySelector(".category-portal__canvas"),
        media: element.querySelector(".category-portal__media"),
        rotationX: 0,
        rotationY: 0,
        targetX: 0,
        targetY: 0,
    }));

    let preloaderFinished = false;
    let running = true;
    let busy = false;
    let previousFrame = performance.now();
    let cursorX = window.innerWidth / 2;
    let cursorY = window.innerHeight / 2;
    let targetCursorX = cursorX;
    let targetCursorY = cursorY;

    const delay = (duration) => new Promise((resolve) => {
        window.setTimeout(resolve, duration);
    });

    function mediaSize(media) {
        if (!media) return { width: 0, height: 0 };
        return {
            width: media.videoWidth || media.naturalWidth || 0,
            height: media.videoHeight || media.naturalHeight || 0,
        };
    }

    function drawCover(context, media, width, height) {
        const size = mediaSize(media);
        if (!size.width || !size.height) return;

        const scale = Math.max(width / size.width, height / size.height);
        const drawWidth = size.width * scale;
        const drawHeight = size.height * scale;
        context.drawImage(
            media,
            (width - drawWidth) / 2,
            (height - drawHeight) / 2,
            drawWidth,
            drawHeight,
        );
    }

    function roundedRectanglePoints(width, height, radius) {
        const points = [];
        const r = Math.max(0, Math.min(radius, width / 2, height / 2));
        const corners = [
            [width / 2 - r, -height / 2 + r, -Math.PI / 2, 0],
            [width / 2 - r, height / 2 - r, 0, Math.PI / 2],
            [-width / 2 + r, height / 2 - r, Math.PI / 2, Math.PI],
            [-width / 2 + r, -height / 2 + r, Math.PI, Math.PI * 1.5],
        ];

        corners.forEach(([centerX, centerY, startAngle, endAngle]) => {
            for (let step = 0; step <= 10; step += 1) {
                const angle = startAngle + (endAngle - startAngle) * (step / 10);
                points.push({
                    x: centerX + Math.cos(angle) * r,
                    y: centerY + Math.sin(angle) * r,
                });
            }
        });

        return points;
    }

    function projectedPoint(point, rotationX, rotationY) {
        const ax = rotationX * Math.PI / 180;
        const ay = rotationY * Math.PI / 180;
        const xx = point.x * Math.cos(ay);
        const yy = point.y * Math.cos(ax);
        const z = point.x * Math.sin(ay) - point.y * Math.sin(ax);
        const perspective = 850 / (850 + z);
        return [xx * perspective, yy * perspective];
    }

    function resizePortal(portal) {
        const width = portal.element.clientWidth;
        const height = portal.element.clientHeight;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        portal.canvas.width = Math.max(1, Math.round(width * dpr));
        portal.canvas.height = Math.max(1, Math.round(height * dpr));
        portal.canvas.style.width = `${width}px`;
        portal.canvas.style.height = `${height}px`;
        portal.canvas.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function drawPortal(portal, delta) {
        portal.rotationX += (portal.targetX - portal.rotationX) * Math.min(1, delta * 9);
        portal.rotationY += (portal.targetY - portal.rotationY) * Math.min(1, delta * 9);

        const width = portal.element.clientWidth;
        const height = portal.element.clientHeight;
        const context = portal.canvas.getContext("2d");
        context.clearRect(0, 0, width, height);

        const radius = Math.min(44, width * 0.2);
        const points = roundedRectanglePoints(width, height, radius);
        const centerX = width / 2;
        const centerY = height / 2;

        context.save();
        context.beginPath();
        points.forEach((point, index) => {
            const [x, y] = projectedPoint(point, portal.rotationX, portal.rotationY);
            if (index === 0) {
                context.moveTo(centerX + x, centerY + y);
            } else {
                context.lineTo(centerX + x, centerY + y);
            }
        });
        context.closePath();
        context.clip();
        context.fillStyle = "#17110f";
        context.fillRect(0, 0, width, height);
        drawCover(context, portal.media, width, height);

        const gradient = context.createLinearGradient(0, height * 0.5, 0, height);
        gradient.addColorStop(0, "rgba(0,0,0,0)");
        gradient.addColorStop(1, "rgba(0,0,0,.7)");
        context.fillStyle = gradient;
        context.fillRect(0, height * 0.5, width, height * 0.5);
        context.restore();
    }

    function setupPortals() {
        portals.forEach((portal) => {
            if (!portal.media) {
                resizePortal(portal);
            } else if (portal.media instanceof HTMLVideoElement) {
                portal.media.playsInline = true;
                portal.media.muted = true;
                portal.media.load();
                portal.media.addEventListener("loadedmetadata", () => {
                    resizePortal(portal);
                    if (!reducedMotion.matches) {
                        portal.media.play().catch(() => {});
                    }
                }, { once: true });
            } else {
                portal.media.addEventListener("load", () => resizePortal(portal), { once: true });
            }

            const resizeObserver = new ResizeObserver(() => resizePortal(portal));
            resizeObserver.observe(portal.element);

            portal.element.addEventListener("pointermove", (event) => {
                if (coarsePointer.matches || busy) return;
                const rect = portal.element.getBoundingClientRect();
                portal.targetY = ((event.clientX - rect.left) / rect.width - 0.5) * 34;
                portal.targetX = ((event.clientY - rect.top) / rect.height - 0.5) * -30;
            });

            portal.element.addEventListener("pointerleave", () => {
                portal.targetX = 0;
                portal.targetY = 0;
                cursor.classList.remove("is-enter");
            });

            portal.element.addEventListener("pointerenter", () => {
                cursor.classList.add("is-enter");
            });

            portal.element.addEventListener("click", (event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                launchPortal(portal);
            });
        });
    }

    async function launchPortal(portal) {
        if (busy) return;

        if (reducedMotion.matches || typeof portal.element.animate !== "function") {
            window.location.assign(portal.element.href);
            return;
        }

        busy = true;
        const rect = portal.element.getBoundingClientRect();
        const scale = Math.max(window.innerWidth / rect.width, window.innerHeight / rect.height);
        const translateX = window.innerWidth / 2 - (rect.left + rect.width / 2);
        const translateY = window.innerHeight / 2 - (rect.top + rect.height / 2);

        experience.classList.add("is-navigating");
        portal.element.classList.add("is-launching");
        cursor.classList.remove("is-visible", "is-enter");

        const animation = portal.element.animate(
            [
                { transform: "translate3d(0,0,0) scale(1)", offset: 0 },
                {
                    transform: `translate3d(${translateX}px,${translateY}px,0) scale(${scale})`,
                    offset: 1,
                },
            ],
            {
                duration: 720,
                easing: "cubic-bezier(.16,1,.3,1)",
                fill: "forwards",
            },
        );

        await animation.finished.catch(() => {});
        window.location.assign(portal.element.href);
    }

    function draw(now) {
        if (!running) return;
        const delta = Math.min((now - previousFrame) / 1000, 0.04);
        previousFrame = now;
        portals.forEach((portal) => drawPortal(portal, delta));
        requestAnimationFrame(draw);
    }

    function updatePointer(event) {
        if (coarsePointer.matches) return;
        const rect = experience.getBoundingClientRect();
        const inside = event.clientY >= rect.top && event.clientY <= rect.bottom;
        cursor.classList.toggle("is-visible", inside);
        targetCursorX = event.clientX;
        targetCursorY = event.clientY;
    }

    function resetPointer() {
        cursor.classList.remove("is-visible", "is-enter");
        portals.forEach((portal) => {
            portal.targetX = 0;
            portal.targetY = 0;
        });
    }

    function cursorLoop() {
        if (!running) return;
        cursorX += (targetCursorX - cursorX) * 0.2;
        cursorY += (targetCursorY - cursorY) * 0.2;
        cursor.style.transform = `translate3d(${cursorX}px,${cursorY}px,0)`;
        requestAnimationFrame(cursorLoop);
    }

    function restartClass(element, className) {
        element.classList.remove(className);
        void element.offsetWidth;
        element.classList.add(className);
    }

    async function startExperience() {
        const mediaReady = portals.map((portal) => new Promise((resolve) => {
            if (!portal.media) {
                resolve();
                return;
            }
            if (!(portal.media instanceof HTMLVideoElement)) {
                if (portal.media.complete) {
                    resolve();
                } else {
                    portal.media.addEventListener("load", resolve, { once: true });
                    portal.media.addEventListener("error", resolve, { once: true });
                }
                return;
            }
            if (portal.media.readyState >= 2) {
                resolve();
                return;
            }
            const finish = () => resolve();
            portal.media.addEventListener("loadeddata", finish, { once: true });
            portal.media.addEventListener("error", finish, { once: true });
            window.setTimeout(finish, 1800);
        }));

        await Promise.all(mediaReady);
        if (!reducedMotion.matches) {
            portals.forEach((portal) => {
                if (portal.media instanceof HTMLVideoElement) {
                    portal.media.play().catch(() => {});
                }
            });
        }
        restartClass(experience, "mask-revealing");
        experience.classList.add("intro-ready");
        await delay(reducedMotion.matches ? 0 : 850);
        restartClass(experience, "content-revealing");
    }

    function finishPreload() {
        if (preloaderFinished) return;
        preloaderFinished = true;
        try {
            window.sessionStorage.setItem("lhw-intro-seen", "1");
        } catch (error) {
            // Storage may be unavailable in privacy-focused browser modes.
        }
        preloaderValue.textContent = "100";
        preloaderCount.classList.add("is-leaving");
        preloaderSkip.hidden = true;
        floatingLogo.classList.add("is-docked");
        preloader.classList.add("is-background");
        document.body.classList.add("preload-complete");
        startExperience().catch(() => {
            experience.classList.add("intro-ready", "mask-revealing", "content-revealing");
        });
        window.setTimeout(() => preloaderCount.remove(), 750);
        window.setTimeout(() => floatingLogo.classList.add("is-settled"), 2000);
    }

    function runPreloader() {
        let introSeen = false;
        try {
            introSeen = window.sessionStorage.getItem("lhw-intro-seen") === "1";
        } catch (error) {
            introSeen = false;
        }

        if (introSeen) {
            preloaderVideo.pause();
            preloader.classList.add("is-background");
            preloaderCount.remove();
            preloaderSkip.remove();
            floatingLogo.classList.add("is-docked", "is-settled");
            document.body.classList.add("preload-complete");
            startExperience().catch(() => {
                experience.classList.add("intro-ready", "mask-revealing", "content-revealing");
            });
            return;
        }

        preloaderSkip.addEventListener("click", finishPreload);

        if (reducedMotion.matches) {
            preloaderVideo.pause();
            window.setTimeout(finishPreload, 250);
            return;
        }

        const fallbackTimer = window.setTimeout(finishPreload, 8000);
        const updateCounter = () => {
            if (preloaderFinished) return;
            const duration = Number.isFinite(preloaderVideo.duration) ? preloaderVideo.duration : 0;
            const progress = duration ? Math.round((preloaderVideo.currentTime / duration) * 100) : 0;
            preloaderValue.textContent = String(Math.max(0, Math.min(100, progress)));
            requestAnimationFrame(updateCounter);
        };

        preloaderVideo.addEventListener("loadedmetadata", () => {
            if (Number.isFinite(preloaderVideo.duration) && preloaderVideo.duration > 0) {
                preloaderVideo.playbackRate = Math.max(0.25, preloaderVideo.duration / 3);
            }
            preloaderVideo.play().catch(() => {
                window.clearTimeout(fallbackTimer);
                finishPreload();
            });
        }, { once: true });

        preloaderVideo.addEventListener("ended", () => {
            window.clearTimeout(fallbackTimer);
            finishPreload();
        }, { once: true });

        preloaderVideo.load();
        requestAnimationFrame(updateCounter);
    }

    setupPortals();
    backgroundVideo.muted = true;
    preloaderVideo.muted = true;
    if (!reducedMotion.matches) {
        backgroundVideo.play().catch(() => {});
    }

    window.addEventListener("pointermove", updatePointer, { passive: true });
    document.documentElement.addEventListener("pointerleave", resetPointer);
    document.addEventListener("visibilitychange", () => {
        running = !document.hidden;
        previousFrame = performance.now();
        portals.forEach((portal) => {
            if (!portal.media || !(portal.media instanceof HTMLVideoElement)) return;
            if (document.hidden || reducedMotion.matches) {
                portal.media.pause();
            } else {
                portal.media.play().catch(() => {});
            }
        });
        if (running) {
            requestAnimationFrame(draw);
            requestAnimationFrame(cursorLoop);
        }
    });

    requestAnimationFrame(draw);
    requestAnimationFrame(cursorLoop);
    runPreloader();
}
