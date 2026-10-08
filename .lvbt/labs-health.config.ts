// Product-owned route health only. Provider requirements belong to platform.json.
export default {
  externalWorkers: [
    {
      slug: 'transit-mapper',
      name: 'transitmapper',
      previewRequired: false,
      externalProbe: {
        path: '/transit-mapper/api/systems/zzzzzzzzzz',
        status: 404,
        contentType: 'application/json',
      },
    },
  ],
};
