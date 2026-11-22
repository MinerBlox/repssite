(() => {
  const html = document.documentElement;
  const body = document.body;
  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (!body || !themeColor) return;
  const transparent = color => !color || color === "transparent" || color === "rgba(0, 0, 0, 0)";
  const originalBodyColor = body.style.backgroundColor;

  function matchViewport() {
    body.style.backgroundColor = originalBodyColor;
    const page = document.getElementById("root");
    const bodyStyle = getComputedStyle(body);
    const pageStyle = page && getComputedStyle(page);
    const light = body.classList.contains("light") || html.classList.contains("light") ||
      body.dataset.theme === "light" || html.dataset.theme === "light";
    const color = [
      bodyStyle.getPropertyValue("--bg").trim(),
      pageStyle?.backgroundColor,
      bodyStyle.backgroundColor
    ].find(value => !transparent(value)) || (light ? "#f5f8ff" : "#0a0a0b");
    const scheme = light ? "light" : "dark";
    html.style.backgroundColor = color;
    body.style.backgroundColor = color;
    html.style.colorScheme = scheme;
    themeColor.content = color;
  }

  matchViewport();
  const observer = new MutationObserver(matchViewport);
  const options = { attributes: true, attributeFilter: ["class", "data-theme"] };
  observer.observe(html, options);
  observer.observe(body, options);
  const page = document.getElementById("root");
  if (page) observer.observe(page, options);
})();
