export function referenceAiCues(reference = {}, changedNow = null) {
  const cues = [];
  const role = String(reference.role || changedNow?.role || "auto");
  const retention = String(reference.retention || changedNow?.retention || "attribute_transfer");
  const description = String(reference.description || "").trim();

  if (reference.role_auto === true && role !== "auto") {
    cues.push({ key: "role", label: `AI role · ${role}` });
  }
  if (reference.retention_auto === true && retention !== "attribute_transfer") {
    cues.push({ key: "retention", label: `AI retention · ${retention}` });
  }
  if (reference.description_auto === true && description) {
    cues.push({ key: "description", label: "AI description" });
  }

  // A freshly executed inference can be useful feedback even when it resolves
  // to the same/default values. Keep one short status cue for that run.
  if (!cues.length && changedNow) {
    cues.push({
      key: "updated",
      label: changedNow.analyzed ? "AI analyzed" : "AI updated",
    });
  }

  return cues;
}

export function guidedT2IModeHelp(currentText = "") {
  const text = String(currentText || "");
  if (!text.includes("Uploaded references are intentionally ignored.")) return text;
  return text.replace(
    "Uploaded references are intentionally ignored.",
    "With connected images, H3 Studio uses them as real FL2VA visual guides while keeping creative T2I prompt semantics.",
  );
}
