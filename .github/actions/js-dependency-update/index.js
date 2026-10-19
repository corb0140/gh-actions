const core = require("@actions/core");
const exec = require("@actions/exec");
const github = require("@actions/github");

// validate strings to prevent injections
const validateBranchName = ({ branchName }) =>
  /^[a-zA-Z0-9_\.\/-]+$/.test(branchName);
const validateDirectoryName = ({ dirName }) =>
  /^[a-zA-Z0-9_\/-]+$/.test(dirName);

async function run() {
  /*
    1. Parse Inputs
        1.1 base-branch from which to check for updates
        1.2 target-branch to use to create the PR
        1.3 Github Token for authentication purposes (to create PRS)
        1.4 Working directory for which to check for dependencies
    2. Execute the npm update command within the working directory
    3. Check whether there are modified files, create a PR
    4. If there are modified files
        4.1 Add and commit files to the target-branch
        4.2 Crete a PR to the base-branch using the octokit API
    5. Otherwise conclude the action
    */

  const baseBranch = core.getInput("base-branch", { required: true });
  const targetBranch = core.getInput("target-branch", { required: true });
  const ghToken = core.getInput("gh-token", { required: true }); // should be treated as a secret
  const workingDir = core.getInput("working-directory", { required: true });
  const debug = core.getBooleanInput("debug");

  const commonExecOpts = {
    cwd: workingDir,
  };

  core.setSecret(ghToken);

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

  core.info(`[js-dependency-update] : base-branch is ${baseBranch}`);
  core.info(`[js-dependency-update] : target-branch is ${targetBranch}`);
  core.info(`[js-dependency-update] : working directory is ${workingDir}`);

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
    core.info("[js-dependency-update] : There are updates available!");
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
      core.error("Something went wrong");
      core.setFailed(e.message);
      core.error(e);
    }
  } else {
    core.info("[js-dependency-update] : No updates right now!");
  }
}

run();
