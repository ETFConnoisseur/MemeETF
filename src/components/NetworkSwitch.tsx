import { useNetwork } from '../contexts/NetworkContext';
import { Switch } from './ui/switch';

export function NetworkSwitch() {
  const { network, setNetwork } = useNetwork();
  const isMainnet = network === 'mainnet-beta';

  const handleToggle = (checked: boolean) => {
    setNetwork(checked ? 'mainnet-beta' : 'devnet');
  };

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/10">
      <span className={`text-xs font-medium transition-colors ${!isMainnet ? 'text-yellow-400' : 'text-white/40'}`}>
        Devnet
      </span>
      <Switch
        checked={isMainnet}
        onCheckedChange={handleToggle}
        className="data-[state=checked]:bg-emerald-600 data-[state=unchecked]:bg-yellow-500/80"
      />
      <span className={`text-xs font-medium transition-colors ${isMainnet ? 'text-emerald-400' : 'text-white/40'}`}>
        Mainnet
      </span>
    </div>
  );
}
