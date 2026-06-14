const UI = {
  surface: "#ffffff",
  soft: "#f8fafc",
  border: "#dbe4ee",
  tx: "#0f172a",
  su: "#64748b",
  greenSoft: "#dcfce7",
  greenBorder: "#bbf7d0",
  greenTx: "#166534",
  amberSoft: "#fff7ed",
  amberBorder: "#fed7aa",
  amberTx: "#92400e",
};

function SectionBlock({ title, fields, fieldStyle = "default" }) {
  if (!fields?.length) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          color: UI.su,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          marginBottom: 8,
        }}
      >
        {title}
      </div>
      {fields.map((f) => (
        <div
          key={`${title}-${f.label}`}
          style={
            fieldStyle === "public"
              ? { padding: "10px 0", borderBottom: `1px solid ${UI.border}` }
              : {
                  display: "grid",
                  gridTemplateColumns: "minmax(130px, 38%) 1fr",
                  gap: 8,
                  padding: "6px 0",
                  borderBottom: `1px solid ${UI.border}`,
                  fontSize: 13,
                }
          }
        >
          <div
            style={
              fieldStyle === "public"
                ? { fontSize: 10, fontWeight: 800, color: UI.su, letterSpacing: 0.6, textTransform: "uppercase" }
                : { color: UI.su, fontWeight: 700, fontSize: 11 }
            }
          >
            {f.label}
          </div>
          <div
            style={
              fieldStyle === "public"
                ? { fontSize: 15, fontWeight: 600, color: UI.tx, marginTop: 4, lineHeight: 1.35 }
                : { color: UI.tx }
            }
          >
            {f.value || "—"}
          </div>
        </div>
      ))}
    </div>
  );
}

export function DcdtReadonlyContent({
  sectionsModel,
  missing = [],
  variant = "modal",
  showPending = true,
}) {
  if (!sectionsModel?.sections?.length) {
    return <div style={{ fontSize: 13, color: UI.su }}>Documento no disponible</div>;
  }

  const isPublic = variant === "public";
  const pending = Array.isArray(missing) ? missing : [];

  return (
    <>
      {sectionsModel.banner ? (
        <div
          style={{
            background: UI.greenSoft,
            border: `1px solid ${UI.greenBorder}`,
            borderRadius: 10,
            padding: "10px 12px",
            marginBottom: 14,
            fontSize: 12,
            color: UI.greenTx,
            fontWeight: 700,
            lineHeight: 1.45,
            textAlign: isPublic ? "center" : "left",
          }}
        >
          {sectionsModel.banner}
        </div>
      ) : null}

      {showPending && pending.length ? (
        <div
          style={{
            background: UI.amberSoft,
            border: `1px solid ${UI.amberBorder}`,
            borderRadius: 10,
            padding: "10px 12px",
            marginBottom: 12,
            fontSize: 11,
            color: UI.amberTx,
            lineHeight: 1.45,
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: 4 }}>Pendientes ({pending.length})</div>
          {pending.map((m) => m.label).join(" · ")}
        </div>
      ) : null}

      {sectionsModel.sections.map((section) => (
        <SectionBlock
          key={section.title}
          title={section.title}
          fields={section.fields}
          fieldStyle={isPublic ? "public" : "default"}
        />
      ))}
    </>
  );
}
