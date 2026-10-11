/**
 * Loads a local, git-ignored .env file if one exists (see .env.example).
 * Variables already set in the shell or CI take precedence over the file.
 */
export function loadEnvFile(path = '.env'): void {
  try {
    process.loadEnvFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}
