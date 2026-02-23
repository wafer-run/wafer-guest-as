export default {
  /**
   * A set of globs passed to the glob package that qualify typescript files for testing.
   */
  entries: ["assembly/__tests__/**/*.spec.ts"],
  /**
   * A set of globs passed to the glob package that quality files to be added to each test.
   */
  include: ["assembly/__tests__/**/*.include.ts"],
  /**
   * A set of regexp that will disclude source files from testing.
   */
  disclude: [/node_modules/],
  /**
   * Add your required AssemblyScript imports here.
   */
  async instantiate(memory, createImports, instantiate, binary) {
    let instance; // Imports can reference this
    const myImports = {
      env: { memory },
      // Stub out the waffle host imports for testing
      waffle: {
        send(_ptr, _len) { return BigInt(0); },
        capabilities() { return BigInt(0); },
        is_cancelled() { return 0; },
      },
    };
    instance = instantiate(binary, createImports(myImports));
    return instance;
  },
  /** Enable code coverage. */
  // coverage: ["assembly/**/*.ts"],
  /**
   * Specify if the binary wasm file should be written to the file system.
   */
  outputBinary: false,
};
