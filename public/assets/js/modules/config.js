let configPromise;

export function getConfig() {
  if (!configPromise) {
    configPromise = fetch('/api/config', { headers: { Accept: 'application/json' } })
      .then(async (response) => {
        if (!response.ok) throw new Error('Não foi possível carregar a configuração do sistema.');
        return response.json();
      });
  }
  return configPromise;
}
