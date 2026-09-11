(() => {
  const STORAGE_KEY = "meu-ritmo-v2.3";
  const WRAPPER_ID = "meu-ritmo-backup-tools";

  function getCurrentData() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function exportBackup() {
    const data = getCurrentData();
    if (!data) {
      alert("Não encontrei dados salvos neste navegador para exportar.");
      return;
    }

    const payload = {
      app: "Meu Ritmo",
      backupVersion: 1,
      storageKey: STORAGE_KEY,
      exportedAt: new Date().toISOString(),
      data,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const today = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `meu-ritmo-backup-${today}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function importBackup(file) {
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const data = parsed?.data ?? parsed;

      if (
        !data ||
        typeof data !== "object" ||
        !Array.isArray(data.tasks) ||
        !Array.isArray(data.habits) ||
        !Array.isArray(data.categories)
      ) {
        throw new Error("invalid-backup");
      }

      const ok = confirm(
        "Importar este backup vai substituir os dados atuais deste navegador. Quer continuar?"
      );
      if (!ok) return;

      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      alert("Backup importado com sucesso. O app será recarregado agora.");
      location.reload();
    } catch {
      alert("Não consegui ler esse arquivo como um backup válido do Meu Ritmo.");
    }
  }

  function makeButton(label, primary = false) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.style.width = "100%";
    button.style.borderRadius = "12px";
    button.style.padding = "11px 14px";
    button.style.fontSize = "12px";
    button.style.fontWeight = "700";
    button.style.cursor = "pointer";
    button.style.border = primary ? "1px solid #24364b" : "1px solid #ddd7cf";
    button.style.background = primary ? "#24364b" : "#fffdf9";
    button.style.color = primary ? "#ffffff" : "#24364b";
    return button;
  }

  function injectBackupTools() {
    if (document.getElementById(WRAPPER_ID)) return;

    const headings = Array.from(document.querySelectorAll("div"));
    const title = headings.find(
      (el) => el.textContent?.trim() === "Sobre seus dados"
    );
    const card = title?.parentElement;
    if (!card) return;

    const dangerButton = Array.from(card.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Limpar todos os dados")
    );
    if (!dangerButton) return;

    const wrapper = document.createElement("div");
    wrapper.id = WRAPPER_ID;
    wrapper.style.marginTop = "16px";
    wrapper.style.display = "grid";
    wrapper.style.gap = "8px";

    const exportButton = makeButton("Exportar backup", true);
    exportButton.addEventListener("click", exportBackup);

    const importButton = makeButton("Importar backup");
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.style.display = "none";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (file) importBackup(file);
      input.value = "";
    });
    importButton.addEventListener("click", () => input.click());

    const note = document.createElement("p");
    note.textContent = "Guarde o arquivo em um lugar seguro antes de grandes atualizações.";
    note.style.margin = "2px 0 4px";
    note.style.fontSize = "10px";
    note.style.lineHeight = "1.5";
    note.style.color = "#8b939b";

    wrapper.append(exportButton, importButton, note, input);
    card.insertBefore(wrapper, dangerButton);
    dangerButton.style.marginTop = "16px";
  }

  const observer = new MutationObserver(injectBackupTools);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectBackupTools);
  } else {
    injectBackupTools();
  }
})();
