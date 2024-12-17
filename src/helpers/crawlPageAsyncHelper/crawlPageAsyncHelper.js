const { exec, execSync } = require('child_process');
const { argv } = require('yargs');
const OPTIONS = require('../../constants/OPTIONS');

let contentOnErrorHelpText = null;

const contentOnError = () => {
  if (contentOnErrorHelpText !== null) {
    contentOnErrorHelpText = execSync(
      'wget --help | grep "content-on-error" || true',
    ).toString();
  }
  return `${contentOnErrorHelpText}`.includes('content-on-error')
    ? '--content-on-error '
    : '';
};

const saveAsReferer = () => {
  if (OPTIONS.SAVE_AS_REFERER) {
    return '';
  }
  return '--trust-server-names ';
};

/**
 * A async version of crawlPageHelper
 */
const crawlPageAsyncHelper = (url, callback = () => {}) => {
  console.log(`Fetching: ${url}`);

  const wgetCommand =
    `wget -q ${OPTIONS.SHOW_PROGRESS_BAR}--recursive ` +
    '--timestamping ' +
    '--page-requisites ' +
    '--no-parent ' +
    '--no-host-directories ' +
    '--restrict-file-name=unix ' +
    `--directory-prefix ${OPTIONS.STATIC_DIRECTORY} ${contentOnError()} ` +
    `${saveAsReferer()}` +
    `${url}`;

  try {
    exec(wgetCommand, { stdio: 'inherit' }, callback);
  } catch (execError) {
    console.log(`ERROR: ${execError.stdout}`);
    console.log(`Using Command: ${wgetCommand}`);

    if (argv.failOnError) {
      process.exit(1);
    }
  }
};

module.exports = crawlPageAsyncHelper;
