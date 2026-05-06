const { notarize } = require('electron-notarize');

exports.default = async function notarizing(context) {
    const { electronPlatformName, appOutDir } = context;

    if (electronPlatformName !== 'darwin') {
        return;
    }

    const appName = context.packager.appInfo.productFilename;
    const appBundleId = context.packager.config.appId;

    const appleId = process.env.APPLE_ID;
    const appleIdPassword = process.env.APPLE_ID_PASSWORD;
    const teamId = process.env.APPLE_TEAM_ID;

    if (!appleId || !appleIdPassword || !teamId) {
        console.warn('Notarization skipped: APPLE_ID, APPLE_ID_PASSWORD, or APPLE_TEAM_ID env vars not set.');
        return;
    }

    console.log(`Notarizing ${appBundleId} (${appName})...`);

    await notarize({
        tool: 'notarytool',
        appBundleId,
        appPath: `${appOutDir}/${appName}.app`,
        appleId,
        appleIdPassword,
        teamId
    });
};
