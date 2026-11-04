(() => {
    const copyButtons = [...document.querySelectorAll("[data-copy-value]")];
    if (!copyButtons.length) return;

    async function copyValue(value) {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(value);
            return;
        }

        const helper = document.createElement("textarea");
        helper.value = value;
        helper.setAttribute("readonly", "");
        helper.style.position = "fixed";
        helper.style.opacity = "0";
        document.body.append(helper);
        helper.select();
        document.execCommand("copy");
        helper.remove();
    }

    copyButtons.forEach((button) => {
        button.addEventListener("click", async () => {
            const status = button.closest(".contact-links")?.querySelector(".copy-status");
            try {
                await copyValue(button.dataset.copyValue);
                if (status) status.textContent = `已复制${button.dataset.copyLabel}`;
                button.classList.add("is-copied");
                window.setTimeout(() => button.classList.remove("is-copied"), 1200);
            } catch (error) {
                if (status) status.textContent = "复制失败，请手动选择账号";
            }
        });
    });
})();
