// Notarization is handled automatically by Apple during MAS review.
// This hook is intentionally a no-op for MAS builds.
exports.default = async function notarizing(context) {
    const { electronPlatformName } = context;

    if (electronPlatformName !== 'darwin') {
        return;
    }

    // MAS submissions are notarized by Apple during the review process.
};
