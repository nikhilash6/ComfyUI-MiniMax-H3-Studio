export function element(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  const { className, text, attrs, dataset, on, ...properties } = options;
  if (className) node.className = className;
  if (text != null) node.textContent = String(text);
  if (attrs) for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  if (dataset) for (const [key, value] of Object.entries(dataset)) node.dataset[key] = String(value);
  if (on) for (const [event, handler] of Object.entries(on)) node.addEventListener(event, handler);
  Object.assign(node, properties);
  for (const child of Array.isArray(children) ? children : [children]) {
    if (child == null) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function selectControl(value, options, label, onChange) {
  const select = element("select", {
    className: "h3s-control h3s-select",
    attrs: { "aria-label": label },
    on: { change: (event) => onChange(event.target.value) },
  });
  for (const option of options) {
    const [key, text] = Array.isArray(option) ? option : [option, option];
    select.append(element("option", { value: key, text }));
  }
  select.value = value;
  return select;
}

export function numberControl(value, options, label, onChange) {
  return element("input", {
    className: "h3s-control h3s-number",
    type: "number",
    value,
    min: options.min,
    max: options.max,
    step: options.step,
    attrs: { "aria-label": label },
    on: { change: (event) => onChange(Number(event.target.value)) },
  });
}

export function rangeControl(value, options, label, onInput) {
  return element("input", {
    className: "h3s-range",
    type: "range",
    value,
    min: options.min,
    max: options.max,
    step: options.step,
    attrs: { "aria-label": label },
    on: { input: (event) => onInput(Number(event.target.value)) },
  });
}

export function iconButton(label, glyph, handler, className = "") {
  return element("button", {
    className: `h3s-icon-button ${className}`.trim(),
    type: "button",
    text: glyph,
    title: label,
    attrs: { "aria-label": label },
    on: { click: handler },
  });
}

export function field(label, control, hint = "") {
  const children = [element("span", { className: "h3s-field-label", text: label }), control];
  if (hint) children.push(element("span", { className: "h3s-field-hint", text: hint }));
  return element("label", { className: "h3s-field" }, children);
}

