
export const CircularProgress = ({ value }: {value: number}) => {
  return <div className="relative w-36 h-36 mx-auto">
    <svg className="w-full h-full" viewBox="0 0 100 100">
      <circle
        className="text-gray-200 stroke-current"
        strokeWidth="10"
        cx="50"
        cy="50"
        r="40"
        fill="transparent"
      ></circle>
      <circle
        className="text-primary-500 stroke-current"
        style={{
            transition: "stroke-dashoffset 0.35s",
            transform: "rotate(-90deg)",
            transformOrigin: "50% 50%"
        }}
        strokeWidth="10"
        strokeLinecap="round"
        cx="50"
        cy="50"
        r="40"
        fill="transparent"
        strokeDasharray="251.2" 
        strokeDashoffset={"calc(251.2 - (251.2 * " + value + ") / 100)"}
      ></circle>
      
      <text x="50" y="50" textAnchor="middle" alignmentBaseline="middle" className="text-xs">{value}%</text>
  
    </svg>
  </div>
}
