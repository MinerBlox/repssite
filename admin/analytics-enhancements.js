export function installTooltip(chartSeries) {
  const canvas = document.getElementById("views-chart");
  const wrap = canvas?.closest(".chart-wrap");
  if (!canvas || !wrap || canvas.dataset.hoverTooltipReady === "true") return;
  canvas.dataset.hoverTooltipReady = "true";

  const tooltip = document.createElement("div");
  tooltip.id = "views-chart-tooltip";
  tooltip.style.cssText = [
    "position:absolute",
    "z-index:10",
    "display:none",
    "pointer-events:none",
    "min-width:92px",
    "padding:8px 10px",
    "border:1px solid #29292f",
    "border-radius:8px",
    "background:rgba(17,17,20,.96)",
    "box-shadow:0 10px 28px rgba(0,0,0,.35)",
    "color:#f1f1f3",
    "font:12px 'DM Sans',sans-serif",
    "line-height:1.35",
    "white-space:nowrap",
    "transform:translate(-50%,-100%)"
  ].join(";");
  wrap.appendChild(tooltip);

  canvas.addEventListener("mousemove", event => {
    const series = chartSeries();
    if (!series.length) {
      tooltip.style.display = "none";
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const width = rect.width || 1;
    const padLeft = 42;
    const padRight = 12;
    const plotWidth = Math.max(1, width - padLeft - padRight);
    const localX = Math.min(width - padRight, Math.max(padLeft, event.clientX - rect.left));
    const index = series.length === 1
      ? 0
      : Math.round(((localX - padLeft) / plotWidth) * (series.length - 1));
    const point = series[Math.max(0, Math.min(series.length - 1, index))];
    const pointX = series.length === 1
      ? padLeft + plotWidth / 2
      : padLeft + plotWidth * index / (series.length - 1);

    tooltip.innerHTML = `<strong style="display:block;margin-bottom:2px">${point.label}</strong><span style="color:#92929c">${Number(point.value || 0).toLocaleString()} view${Number(point.value) === 1 ? "" : "s"}</span>`;
    tooltip.style.left = `${pointX}px`;
    tooltip.style.top = `${Math.max(34, event.clientY - rect.top - 8)}px`;
    tooltip.style.display = "block";
  });

  canvas.addEventListener("mouseleave", () => {
    tooltip.style.display = "none";
  });

  document.querySelectorAll(".chart-range").forEach(button => {
    button.addEventListener("click", () => {
      tooltip.style.display = "none";
    });
  });
}
