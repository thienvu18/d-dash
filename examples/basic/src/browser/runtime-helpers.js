export async function waitForElementSize(
  el,
  { minWidth = 180, minHeight = 90, timeoutMs = 1200 } = {},
) {
  const startedAt = performance.now();

  while (performance.now() - startedAt < timeoutMs) {
    if (el.clientWidth >= minWidth && el.clientHeight >= minHeight) {
      return true;
    }
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }

  return false;
}

export function setupWidgetResizeObservers(registry, session, widgetTargets) {
  const observers = [];

  for (const widget of session.widgets) {
    const target = widgetTargets[widget.id];
    const adapter = registry.requireVisualization(widget.visualization.type);
    if (!target || !adapter.resize) {
      continue;
    }

    const observer = new ResizeObserver(() => {
      adapter.resize?.(target);
    });
    observer.observe(target.el);
    observers.push(observer);
  }

  return () => {
    for (const observer of observers) {
      observer.disconnect();
    }
  };
}
