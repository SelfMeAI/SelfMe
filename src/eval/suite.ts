import type { EvalTaskDefinition } from "./types.js";

const nodeTodoFixture = {
  "node-todo/package.json": '{\n  "name": "node-todo",\n  "private": true\n}\n',
  "node-todo/app.js": 'const PORT = 3000;\nconsole.log(PORT);\n',
  "node-todo/views/index.ejs": '<form action="/add" method="post">\n  <input name="title" />\n</form>\n',
  "node-todo/verify-setup.mjs": [
    'import { readFile } from "node:fs/promises";',
    'const app = await readFile(new URL("./app.js", import.meta.url), "utf8");',
    'const view = await readFile(new URL("./views/index.ejs", import.meta.url), "utf8");',
    'if (!app.includes("process.env.PORT") || !view.includes("maxlength=\\\"100\\\"")) {',
    '  console.error("not-ready");',
    '  process.exit(1);',
    '}',
    'console.log("ready");',
    ''
  ].join("\n")
};

const nodeTodoExpectations = {
  files: [
    {
      path: "node-todo/app.js",
      includes: "process.env.PORT"
    },
    {
      path: "node-todo/views/index.ejs",
      includes: 'maxlength="100"'
    }
  ],
  commands: [
    {
      command: "node node-todo/verify-setup.mjs",
      exitCode: 0,
      stdoutEquals: "ready\n"
    }
  ],
  assistantIncludesAny: ["node-todo", "ready", "maxlength"]
} satisfies EvalTaskDefinition["expectations"];

const approvalReuseFixture = {
  "src/show-runtime.mjs": 'console.log("pending");\n',
  "verify-runtime.mjs": [
    'import { spawnSync } from "node:child_process";',
    'const result = spawnSync(process.execPath, ["src/show-runtime.mjs"], { encoding: "utf8" });',
    'if (result.status !== 0 || result.stdout !== "SelfMe:ready\\n") {',
    '  console.error(result.stderr || result.stdout || "not-ready");',
    '  process.exit(1);',
    '}',
    'console.log("ready");',
    ''
  ].join("\n")
};

const failureFirstFixture = {
  "config/service.json": '{\n  "name": "SelfMe",\n  "surface": "api",\n  "version": "v1"\n}\n',
  "src/show-service.mjs": 'import service from "../config/service.json" with { type: "json" };\nconsole.log(`${service.name}:${service.surface}`);\n',
  "verify-service.mjs": [
    'import { spawnSync } from "node:child_process";',
    'const result = spawnSync(process.execPath, ["src/show-service.mjs"], { encoding: "utf8" });',
    'const expected = "SelfMe:api-v1\\n";',
    'if (result.status !== 0 || result.stdout !== expected) {',
    '  console.error(`expected ${expected.trim()}, got ${(result.stdout || result.stderr || "no output").trim()}`);',
    '  process.exit(1);',
    '}',
    'console.log("ready");',
    ''
  ].join("\n")
};

const approvalResumeFixture = {
  "resume-after-approval.mjs": 'console.log("pending");\n',
  "verify-resume-after-approval.mjs": [
    'import { spawnSync } from "node:child_process";',
    'const result = spawnSync(process.execPath, ["resume-after-approval.mjs"], { encoding: "utf8" });',
    'if (result.status !== 0 || result.stdout !== "resumed\\n") {',
    '  console.error(result.stderr || result.stdout || "not-ready");',
    '  process.exit(1);',
    '}',
    'console.log("ready");',
    ''
  ].join("\n")
};

export const baselineEvalTasks: EvalTaskDefinition[] = [
  {
    id: "single-file-exact-repair",
    title: "Repair one existing script and verify exact output",
    prompt: "Fix greet.mjs so running `node greet.mjs` prints exactly `Hello, SelfMe!`. Make the change directly, verify it, and keep working until the output is exact.",
    fixture: {
      "greet.mjs": 'console.log("Hello");\n'
    },
    quality: {
      recommendedMaxToolCalls: 3
    },
    expectations: {
      files: [
        {
          path: "greet.mjs",
          includes: "Hello, SelfMe!"
        }
      ],
      commands: [
        {
          command: "node greet.mjs",
          exitCode: 0,
          stdoutEquals: "Hello, SelfMe!\n"
        }
      ],
      approvalCount: {
        min: 1,
        max: 1
      },
      requiredToolCalls: [
        {
          toolName: "edit"
        },
        {
          toolName: "shell",
          summaryIncludes: "node greet.mjs · completed"
        }
      ],
      assistantIncludesAny: ["greet.mjs", "Hello, SelfMe!"]
    }
  },
  {
    id: "cross-file-config-repair",
    title: "Read configuration, repair an existing script, and verify it",
    prompt: "Read config/profile.json and fix src/show-profile.mjs so running `node src/show-profile.mjs` prints exactly `SelfMe:local`. Make the change directly, verify it, and keep working until the output is exact.",
    fixture: {
      "config/profile.json": '{\n  "name": "SelfMe",\n  "region": "local"\n}\n',
      "src/show-profile.mjs": 'import profile from "../config/profile.json" with { type: "json" };\nconsole.log(profile.name);\n'
    },
    quality: {
      recommendedMaxToolCalls: 7
    },
    expectations: {
      files: [
        {
          path: "src/show-profile.mjs",
          includes: "profile.region"
        }
      ],
      commands: [
        {
          command: "node src/show-profile.mjs",
          exitCode: 0,
          stdoutEquals: "SelfMe:local\n"
        }
      ],
      assistantIncludesAny: ["show-profile.mjs", "SelfMe:local"]
    }
  },
  {
    id: "multi-file-project-completion",
    title: "Complete a two-file project change before reporting completion",
    prompt: "Inspect node-todo and directly optimize it: update node-todo/app.js so its port uses process.env.PORT, and update node-todo/views/index.ejs so the title input has maxlength 100. Then run `node node-todo/verify-setup.mjs` and keep working until it prints exactly `ready`.",
    fixture: nodeTodoFixture,
    quality: {
      recommendedMaxToolCalls: 6
    },
    expectations: nodeTodoExpectations
  },
  {
    id: "multi-file-project-resume",
    title: "Resume a project task after its first successful edit",
    prompt: "Inspect node-todo and directly optimize it: update node-todo/app.js so its port uses process.env.PORT, and update node-todo/views/index.ejs so the title input has maxlength 100. Then run `node node-todo/verify-setup.mjs` and keep working until it prints exactly `ready`.",
    fixture: nodeTodoFixture,
    interruption: {
      afterToolSummaryIncludes: " · updated",
      followUp: "继续"
    },
    quality: {
      recommendedMaxToolCalls: 8
    },
    expectations: nodeTodoExpectations
  },
  {
    id: "multi-file-approval-reuse",
    title: "Complete a multi-file change within a one-approval budget",
    prompt: "Create config/runtime-label.mjs exporting a function named renderRuntimeLabel that returns exactly `SelfMe:ready`, then update src/show-runtime.mjs to import that function and print exactly its return value. Run `node verify-runtime.mjs` and keep working until it prints exactly `ready`.",
    fixture: approvalReuseFixture,
    quality: {
      recommendedMaxToolCalls: 7
    },
    expectations: {
      files: [
        {
          path: "config/runtime-label.mjs",
          includes: "renderRuntimeLabel"
        },
        {
          path: "src/show-runtime.mjs",
          includes: "renderRuntimeLabel"
        }
      ],
      commands: [
        {
          command: "node verify-runtime.mjs",
          exitCode: 0,
          stdoutEquals: "ready\n"
        }
      ],
      approvalCount: {
        min: 1,
        max: 1
      },
      assistantIncludesAny: ["ready", "runtime-label", "SelfMe:ready"]
    }
  },
  {
    id: "failure-first-project-repair",
    title: "Recover from an observed verification failure",
    prompt: "First run `node verify-service.mjs` by itself to observe the current failure. Then read config/service.json and repair src/show-service.mjs so it uses the configured version instead of a hardcoded literal. Rerun `node verify-service.mjs` and keep working until it prints exactly `ready`.",
    fixture: failureFirstFixture,
    quality: {
      recommendedMaxToolCalls: 6
    },
    expectations: {
      files: [
        {
          path: "src/show-service.mjs",
          includes: "service.version"
        }
      ],
      commands: [
        {
          command: "node verify-service.mjs",
          exitCode: 0,
          stdoutEquals: "ready\n"
        }
      ],
      approvalCount: {
        min: 1,
        max: 1
      },
      requiredToolCalls: [
        {
          toolName: "shell",
          summaryIncludes: "node verify-service.mjs · failed (1)"
        },
        {
          toolName: "shell",
          summaryIncludes: "node verify-service.mjs · completed"
        }
      ],
      assistantIncludesAny: ["ready", "show-service", "SelfMe:api-v1"]
    }
  },
  {
    id: "approval-interruption-resume",
    title: "Resume a task interrupted while an edit approval is pending",
    prompt: "Read resume-after-approval.mjs, then use the edit tool to change it so it prints exactly `resumed`. Run `node verify-resume-after-approval.mjs` and keep working until it prints exactly `ready`.",
    fixture: approvalResumeFixture,
    interruption: {
      afterApprovalToolName: "edit",
      followUp: "继续"
    },
    quality: {
      recommendedMaxToolCalls: 6
    },
    expectations: {
      files: [
        {
          path: "resume-after-approval.mjs",
          includes: "resumed"
        }
      ],
      commands: [
        {
          command: "node verify-resume-after-approval.mjs",
          exitCode: 0,
          stdoutEquals: "ready\n"
        }
      ],
      approvalCount: {
        min: 2,
        max: 2
      },
      requiredToolCalls: [
        {
          toolName: "edit",
          summaryIncludes: "resume-after-approval.mjs"
        },
        {
          toolName: "shell",
          summaryIncludes: "node verify-resume-after-approval.mjs · completed"
        }
      ],
      assistantIncludesAny: ["ready", "resumed", "resume-after-approval"]
    }
  }
];
