export function advancedDemoPack(){
  const image={type:'image',url:'/demo/point.svg'},audio={type:'audio',url:'/demo/tone.wav'};
  const q=(id,price,text,answer,extra={})=>({id,price,text,answer,media:[],answerMedia:[],options:[],type:'simple',...extra});
  return {name:'Новые механики · пробный набор',author:'Своя компания',libraryId:'mechanics',warnings:[],rounds:[{name:'Знакомство с механиками',themes:[
    {name:'Особые вопросы',questions:[q('special-0',100,'Сколько сторон у шестиугольника?','6',{type:'stake',answerType:'number',rightAnswers:['6']}),q('special-1',200,'Как называется самая большая планета Солнечной системы?','Юпитер',{type:'secret',special:{theme:'Космос',selectionMode:'any',min:100,max:500,step:100}}),q('special-2',300,'Какое число идёт после девяти?','10',{type:'noRisk',answerType:'number',rightAnswers:['10']})]},
    {name:'Новые ответы',questions:[q('answer-0',100,'Сколько минут в двух часах?','120',{answerType:'number',rightAnswers:['120'],answerDeviation:0}),q('answer-1',200,'Выбери центр золотого круга.','Центр круга',{answerType:'point',rightAnswers:['0.5,0.5,1.54'],answerDeviation:.06,media:[image]}),q('answer-2',300,'Как называется наша игра?','Своя компания',{type:'forAll'})]},
    {name:'Поэтапный вопрос',questions:[q('staged-0',100,'Послушайте и посмотрите.','Три секунды, круг',{media:[audio,image],stages:[{text:'Послушайте звук. Картинка появится после него.',media:[audio],waitForFinish:true},{text:'Посмотрите на фигуру. Через 3 секунды появится вопрос.',media:[image],duration:3},{text:'Какой формы золотая фигура?',media:[image]}]})]}
  ]}]};
}
export function demoTone(){
  const samples=8000*3,b=Buffer.alloc(44+samples*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(8000,24);b.writeUInt32LE(16000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(samples*2,40);
  for(let i=0;i<samples;i++)b.writeInt16LE(Math.round(Math.sin(i*2*Math.PI*220/8000)*700),44+i*2);return b;
}
