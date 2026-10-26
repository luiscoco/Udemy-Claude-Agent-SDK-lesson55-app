import { renderMarkdown } from "./markdown.js";
const $ = (id) => document.getElementById(id);
let data = {}, rows = [], events = [];
function json(id, value) {
    $(id).textContent = JSON.stringify(value, null, 2);
    window.Prism?.highlightElement($(id));
}
function table(id, records) {
    $(id).replaceChildren(...records.map((values) => {
        const tr = document.createElement("tr");
        for (const v of values) {
            const td = document.createElement("td");
            td.textContent = String(v ?? "");
            tr.append(td);
        }
        return tr;
    }));
}
function draw() {
    $("span-count").textContent = data.workerProcess
        ? String(data.workerProcess.exitCode)
        : "Pending";
    $("metric-count").textContent = String(data.results?.length || 0);
    $("log-count").textContent = String(data.tools?.length || 0);
    const obs = data.observations || [];
    table("trace-history", obs
        .filter((o) => o.kind === "tool-policy")
        .map((o) => [
        o.detail.tool,
        o.detail.decision,
        JSON.stringify(o.detail.input),
    ]));
    const commandRows = (data.commands || []).map((r) => [
        "SDK Bash result",
        r.input.command,
        JSON.stringify(r.response),
    ]);
    if (data.lint)
        commandRows.push([
            "Independent host lint",
            "node ci/lint.mjs",
            JSON.stringify(data.lint),
        ]);
    if (data.tests)
        commandRows.push([
            "Independent host tests",
            "node --test tests/greeting.test.mjs",
            JSON.stringify(data.tests),
        ]);
    table("metric-history", commandRows);
    const filter = $("user-filter").value.trim();
    table("log-history", obs
        .filter((o) => !filter || o.kind === filter)
        .map((o) => [o.kind, JSON.stringify(o.detail)]));
    json("telemetry", obs);
    json("requests", data.tools || []);
}
$("user-filter").addEventListener("input", draw);
$("run").onclick = async () => {
    const button = $("run");
    button.disabled = true;
    data = {};
    rows = [];
    events = [];
    draw();
    $("conversation").replaceChildren();
    $("diff").textContent = "Waiting for the actual job.";
    json("process", {});
    json("evidence", {});
    $("status").textContent = "Running a real local pipeline process...";
    try {
        const response = await fetch("/api/run", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode: $("mode").value }),
        });
        if (!response.ok)
            throw new Error(await response.text());
        const reader = response.body.getReader(), decoder = new TextDecoder();
        let buffer = "", text = "";
        while (true) {
            const { value, done } = await reader.read();
            if (done)
                break;
            buffer += decoder.decode(value, { stream: true });
            let n;
            while ((n = buffer.indexOf("\n\n")) >= 0) {
                const frame = buffer.slice(0, n);
                buffer = buffer.slice(n + 2);
                if (!frame.startsWith("data: "))
                    continue;
                const e = JSON.parse(frame.slice(6));
                events.push(e);
                if (e.type === "text") {
                    text += e.text + "\n\n";
                    renderMarkdown($("conversation"), text);
                }
                if (e.type === "observation") {
                    rows.push(e.observation);
                    data.observations = rows;
                    if (e.observation.kind === "configuration")
                        json("options", e.observation.detail);
                    if (e.observation.kind === "native-tool")
                        (data.tools ||= []).push(e.observation.detail);
                    if (e.observation.kind === "tool-result" &&
                        e.observation.detail.tool === "Bash")
                        (data.commands ||= []).push(e.observation.detail);
                    draw();
                }
                if (e.type === "result") {
                    (data.results ||= []).push(e.result);
                    json("native-result", e.result);
                    draw();
                }
                if (e.type === "evidence") {
                    data = e.evidence;
                    draw();
                    json("evidence", data);
                    json("process", {
                        actualJobProcess: data.workerProcess,
                        reportedExitMatchesActual: data.reportedExitMatchesActual,
                        nativeCliProcessExit: data.runtime?.exitCode ??
                            "SDK result has no standalone CLI exit field",
                        nativeSuccess: data.nativeSuccess,
                        denials: data.denials,
                        validationError: data.validationError,
                        pipelineExitCode: data.pipelineExitCode,
                    });
                    json("storage", {
                        fixtureUnchanged: data.fixtureUnchanged,
                        fixturesValid: data.fixturesValid,
                        forbiddenExecuted: data.forbiddenExecuted,
                        beforeHash: data.before?.hash,
                        afterHash: data.after?.hash,
                        structured: data.structured,
                        scope: data.scope,
                    });
                    json("diagnostics", {
                        exception: data.exception,
                        cleanupError: data.cleanupError,
                        validationError: data.validationError,
                        nativeStderr: data.runtime?.stderr,
                        workerStderr: data.workerStderr,
                        runtime: data.runtime,
                    });
                    $("diff").textContent =
                        data.diff || "No Git diff: the trusted fixture was not changed.";
                    window.Prism?.highlightElement($("diff"));
                    json("host-checks", { lint: data.lint, tests: data.tests });
                }
                if (e.type === "error")
                    throw new Error(e.text);
            }
        }
        $("status").textContent =
            data.workerProcess?.exitCode === 0
                ? "Pipeline passed: actual process exit 0."
                : "Pipeline failed or stopped: actual process exit " +
                    String(data.workerProcess?.exitCode) +
                    ". Inspect the native result and gate evidence.";
    }
    catch (e) {
        $("status").textContent = String(e);
    }
    finally {
        button.disabled = false;
    }
};
$("download").onclick = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(events, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "lesson55-pipeline-evidence.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};
fetch("/api/config")
    .then((r) => r.json())
    .then((c) => {
    $("configuration").textContent = c.ready
        ? "Ready: " +
            c.model +
            ". Local pipeline processes; hosted agent workflows require a repository secret."
        : "Configure your private API key in .env and restart. Open How to run.";
    $("run").disabled = !c.ready;
});
draw();
