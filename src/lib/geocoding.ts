// Geocodificacao de enderecos de fornecedores (Fase 14, 04/08/2026), usada
// para posicionar pinos no mapa da aba Fornecedores.
//
// Chama a Geocoding API do Google diretamente por fetch (sem SDK), usando a
// chave GOOGLE_MAPS_SERVER_KEY (server-only, nunca exposta ao browser -- e
// diferente da chave NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY usada pelo mapa no
// client). Enquanto a chave nao estiver configurada (ou a API nao estiver
// habilitada/faturamento pendente no Google Cloud), a funcao retorna null em
// vez de lancar erro -- o cadastro do fornecedor nunca deve falhar por causa
// disso, o mapa so vai mostrar o pino quando a geocodificacao acontecer.
//
// NOTA (04/08/2026): a ativacao do Maps JavaScript API no Google Cloud ficou
// pendente de um pre-pagamento no cartao (autorizado pelo usuario para ser
// feito no fim de semana, quando o limite libera). Ate la, GOOGLE_MAPS_SERVER_KEY
// nao existe como variavel de ambiente -- esta funcao ja fica pronta, so vai
// funcionar de verdade assim que a chave for configurada na Vercel.

export type Coordenadas = { latitude: number; longitude: number };

export async function geocodificarEndereco(endereco: string): Promise<Coordenadas | null> {
  const chave = process.env.GOOGLE_MAPS_SERVER_KEY;
  const enderecoLimpo = endereco.trim();
  if (!chave || !enderecoLimpo) return null;

  try {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", enderecoLimpo);
    url.searchParams.set("key", chave);

    const resposta = await fetch(url.toString());
    if (!resposta.ok) {
      console.error("Geocoding API respondeu com erro HTTP:", resposta.status);
      return null;
    }

    const dados = await resposta.json();
    if (dados.status !== "OK" || !dados.results?.[0]?.geometry?.location) {
      if (dados.status !== "ZERO_RESULTS") {
        console.error("Geocoding API retornou status inesperado:", dados.status, dados.error_message);
      }
      return null;
    }

    const { lat, lng } = dados.results[0].geometry.location;
    return { latitude: lat, longitude: lng };
  } catch (error) {
    console.error("Erro ao geocodificar endereco:", error);
    return null;
  }
}
