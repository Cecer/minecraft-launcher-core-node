# Fabric Module

[![npm version](https://img.shields.io/npm/v/@xmcl/fabric.svg)](https://www.npmjs.com/package/fabric)
[![npm](https://img.shields.io/npm/l/@xmcl/minecraft-launcher-core.svg)](https://github.com/voxelum/minecraft-launcher-core-node/blob/master/LICENSE)
[![Build Status](https://github.com/voxelum/minecraft-launcher-core-node/workflows/Release%20Pre-Check/badge.svg)](https://github.com/voxelum/minecraft-launcher-core-node/workflows/Release%20Pre-Check/badge.svg)

This is a sub-module belong to [minecraft-launcher-core](https://www.npmjs.com/package/@xmcl/minecraft-launcher-core) module. You can still use this individually.

### Fabric 

```ts
    import { Fabric } from "@xmcl/fabric";
    const versionList: Fabric.VersionList = await Fabric.updateVersionList();
    const latestYarnVersion = versionList.yarnVersions[0]; // yarn version is combined by mcversion+yarn build number
    const latestLoaderVersion = versionList.loaderVersions[0];
```

Fetch the new fabric version list.

```ts
    import { Fabric } from "@xmcl/fabric";
    const minecraftLocation: MinecraftLocation;
    const yarnVersion: string; // e.g. "1.14.1+build.10"
    const loaderVersion: string; // e.g. "0.4.7+build.147"
    const installPromise: Promise<void> = Fabric.install(yarnVersion, loaderVersion, minecraftLocation)
```

Install fabric to the client. This installation process doesn't ensure the minecraft libraries.

Please run `Installer.installDependencies` after that to install fully.

