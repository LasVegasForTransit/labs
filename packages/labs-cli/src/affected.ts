export interface WorkspaceProject {
  name: string;
  directory: string;
  dependencies: string[];
  slug?: string;
  status?: string;
  archive?: boolean;
}

function documentation(file: string): boolean {
  return (
    file.startsWith('docs/') ||
    file.startsWith('audits/') ||
    (!file.includes('/') && /\.(?:md|txt)$/.test(file))
  );
}

function fileOwners(projects: WorkspaceProject[], file: string): WorkspaceProject[] {
  if (documentation(file)) return [];
  const home = projects.filter((project) => project.slug === 'home');
  const owners = projects.filter((project) => file.startsWith(`${project.directory}/`));
  if (file.startsWith('catalog/'))
    return [
      ...home,
      ...projects.filter((project) => project.archive && file === `catalog/${project.slug}.json`),
    ];
  if (file.startsWith('retired/'))
    return [
      ...home,
      ...owners,
      ...projects.filter(
        (project) => project.archive && file.startsWith(`retired/${project.slug}/`),
      ),
    ];
  if (!owners.length) return projects;
  return /^apps\/[^/]+\/lab\.config\.ts$/.test(file) ? [...owners, ...home] : owners;
}

export function affectedProjects(
  current: WorkspaceProject[],
  files: string[],
  previous: WorkspaceProject[] = [],
) {
  const graph = [...current, ...previous];
  const affected = new Set(
    files.flatMap((file) => fileOwners(graph, file).map((project) => project.name)),
  );
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const project of graph) {
      if (
        !affected.has(project.name) &&
        project.dependencies.some((dependency) => affected.has(dependency))
      ) {
        affected.add(project.name);
        expanded = true;
      }
    }
  }
  const projects = current.filter((project) => affected.has(project.name));
  const apps = projects.filter((project) => project.slug !== undefined);
  const deploy = apps.filter(
    (project) => project.status === 'active' || project.status === 'deprecated' || project.archive,
  );
  return {
    packages: projects
      .filter((project) => !project.archive)
      .map((project) => project.name)
      .sort(),
    apps: apps.map((project) => project.slug ?? '').sort(),
    deploy: deploy
      .map((project) => project.slug ?? '')
      .sort((left, right) => {
        if (left === right) return 0;
        if (left === 'home') return 1;
        if (right === 'home') return -1;
        return left.localeCompare(right);
      }),
  };
}
