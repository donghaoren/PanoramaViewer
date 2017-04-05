export function orderFiles<File extends { filename: string, dirname: string }>(files: File[]): { dirname: string, files: File[] }[] {
    let dirs = new Map<string, File[]>();
    for(let f of files) {
        if(dirs.has(f.dirname)) {
            dirs.get(f.dirname).push(f);
        } else {
            dirs.set(f.dirname, [ f ]);
        }
    }
    let result: { dirname: string, files: File[] }[] = [];
    dirs.forEach((files, dirname) => {
        files.sort((a, b) => a.filename.toLowerCase() < b.filename.toLowerCase() ? -1 : 1);
        result.push({ dirname: dirname, files: files });
    });
    result.sort((a, b) => a.dirname.toLowerCase() < b.dirname.toLowerCase() ? -1 : 1);
    return result;
}
