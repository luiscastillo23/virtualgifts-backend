export function sanitizeFilename(filename: string): string {
    // Replace spaces with underscores first
    const nameWithoutSpaces = filename.replace(/ /g, '_');
    // Replace any character that is not a letter, number, underscore, dot, or hyphen with an underscore
    const safeName = nameWithoutSpaces.replace(/[^a-zA-Z0-9_.\-]/g, '_');
    // Optionally, handle potential multiple consecutive underscores resulting from replacements
    return safeName.replace(/__+/g, '_');
  }