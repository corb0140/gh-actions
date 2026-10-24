const core = require("@actions/core");
const exec = require("@actions/exec");
const github = require("@actions/github");

// validate strings to prevent injections
const validateBranchName = ({ branchName }) =>
  /^[a-zA-Z0-9_\.\/-]+$/.test(branchName);
const validateDirectoryName = ({ dirName }) =>
  /^[a-zA-Z0-9_\/-]+$/.test(dirName);

const setupLogger = ({ debug, prefix } = { debug: false, prefix: "" }) => ({
  debug: (message) => {
    core.info(`DEBUG: ${prefix}${prefix ? " : " : ""}${message}`);
  },
  info: (message) => {
    core.info(`${prefix}${prefix ? " : " : ""}${message}`);
  },
  error: (message) => {
    core.error(`${prefix}${prefix ? " : " : ""}${message}`);
  },
});

async function run() {
  const baseBranch = core.getInput("base-branch", { required: true });
  const targetBranch = core.getInput("target-branch", { required: true });
  const ghToken = core.getInput("gh-token", { required: true }); // should be treated as a secret
  const workingDir = core.getInput("working-directory", { required: true });
  const debug = core.getBooleanInput("debug");
  const logger = setupLogger({ debug, prefix: "[js-dependency-update]" });

  const commonExecOpts = {
    cwd: workingDir,
  };

  core.setSecret(ghToken);

  logger.debug(
    "Validating inputs - base -branch, target-branch, working-directory",
  );

  if (!validateBranchName({ branchName: baseBranch })) {
    core.setFailed(
      "Invalid base-branch name. branch name should include only characters, numbers, hyphens, dots, underscores, and forward slashes",
    );
    return;
  }

  if (!validateBranchName({ branchName: targetBranch })) {
    core.setFailed(
      "Invalid target-branch name. branch name should include only characters, numbers, hyphens, dots, underscores, and forward slashes",
    );
    return;
  }

  if (!validateDirectoryName({ dirName: workingDir })) {
    core.setFailed(
      "Invalid working-directory name. Directory name should include only characters, numbers, hyphens, underscores, and forward slashes",
    );
    return;
  }

  logger.debug(`base-branch is ${baseBranch}`);
  logger.debug(`target-branch is ${targetBranch}`);
  logger.debug(`working directory is ${workingDir}`);

  logger.debug("Checking for package updates");

  await exec.exec("npm update", [], {
    ...commonExecOpts,
  });

  const gitStatus = await exec.getExecOutput(
    "git status -s package*.json",
    [],
    {
      ...commonExecOpts,
    },
  );

  if (gitStatus.stdout.length > 0) {
    logger.debug("There are updates available!");
    logger.debug("setting up git");

    await exec.exec(`git config --global user.name "gh-automation"`);
    await exec.exec(`git config --global user.email "gh-automation@email.com"`);
    await exec.exec(`git checkout -b ${targetBranch}`, [], {
      ...commonExecOpts,
    });
    await exec.exec(`git add package.json package-lock.json`, [], {
      ...commonExecOpts,
    });
    await exec.exec(`git commit -m "chore: update dependencies"`, [], {
      ...commonExecOpts,
    });
    await exec.exec(`git push -u origin ${targetBranch} --force`, [], {
      ...commonExecOpts,
    });

    const octoKit = github.getOctokit(ghToken);

    try {
      await octoKit.rest.pulls.create({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        title: "Update NPM dependencies",
        body: "this pull request updates pull",
        base: baseBranch,
        head: targetBranch,
      });
    } catch (e) {
      logger.error("Something went wrong");
      core.setFailed(e.message);
      logger.error(e);
    }
  } else {
    logger.info("No updates right now!");
  }
}

run();
